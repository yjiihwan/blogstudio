/**
 * 사진 요청 슬롯의 자동 이미지 소싱.
 *  - "stock"        : 스톡 소스(Unsplash/Pexels)를 설정된 순서로 검색
 *  - "ai"           : AI 생성 소스(Google Imagen/OpenAI gpt-image-1)를 설정된 순서로 생성
 *  - "stock_then_ai": 스톡 먼저, 실패하면 AI 생성으로 폴백
 * 설정(사용여부·순서·자동검증)은 lib/image-source-config.ts, 키는 lib/image-keys.ts.
 * 각 소스는 실패 사유 코드를 돌려주고, 시도 내역(attempts)은 images.sourceMetaJson 에 기록된다.
 * 자동 검증이 켜져 있으면 후보를 비전 모델로 심사해 첫 합격작을 채택한다(lib/image-judge.ts).
 * 재시도(같은 소스 반복 호출)는 하지 않는다.
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { resolveImageSources } from "./image-keys";
import { llm } from "./llm";
import OpenAI from "openai";
import { saveImageBuffer, deleteImageFile } from "./storage";
import { SOURCE_LABEL, type ImageSource, type ImageSourceConfig } from "./image-source-config";
import {
  createJudgeContext,
  judgeImage,
  estimateJudgeCostUsd,
  type JudgeContext,
  type JudgeScore,
} from "./image-judge";

export type AutoMode = "stock" | "ai" | "stock_then_ai";

export type FailReason =
  | "disabled"
  | "no_key"
  | "auth_error"
  | "rate_limit"
  | "no_result"
  | "download_failed"
  | "policy_blocked"
  | "network_error"
  | "judge_rejected"
  | "unknown";

export const FAIL_REASON_LABEL: Record<FailReason, string> = {
  disabled: "사용 꺼짐",
  no_key: "키 없음",
  auth_error: "키 오류",
  rate_limit: "호출 한도 초과",
  no_result: "검색 결과 없음",
  download_failed: "다운로드 실패",
  policy_blocked: "정책 차단",
  network_error: "네트워크 오류",
  judge_rejected: "심사 불합격",
  unknown: "알 수 없는 오류",
};

/** 채택 이미지의 심사 기록(sourceMetaJson.judge) */
export type JudgeRecord =
  | { verified: "pass"; match: number; quality: number; issues: string[]; candidatesTried: number; model: string }
  | { verified: "skipped"; reason: string; candidatesTried: number; model: string };

export type Attempt = {
  source: ImageSource;
  result: "adopted" | "failed" | "skipped";
  reason?: FailReason;
  detail?: string;
  candidatesTried?: number;
  /** 탈락 후보들의 심사 점수(디버깅·보고용) */
  rejected?: Array<{ match: number; quality: number; issues: string[] }>;
};

type Sourced = {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  source: "stock_free" | "ai_generated";
  meta: Record<string, unknown>;
  judge: JudgeRecord;
};

type ProviderResult =
  | { ok: true; sourced: Sourced; candidatesTried: number; rejected: JudgeScore[] }
  | { ok: false; reason: FailReason; detail?: string; candidatesTried?: number; rejected?: JudgeScore[] };

const STOCK_CANDIDATES = 5;

/** 한국어 묘사(+선택 피드백) → 영어 스톡 검색 키워드 (실패 시 원문 폴백) */
async function toEnglishQuery(description: string, userId: string, feedback?: string): Promise<string> {
  try {
    const res = await llm({
      system: "You convert Korean image descriptions into concise English stock-photo search queries.",
      messages: [
        {
          role: "user",
          content: [
            `Description (Korean): ${description}`,
            feedback?.trim() ? `User feedback to incorporate (Korean): ${feedback.trim()}` : "",
            `Return ONLY 3~6 English keywords, space-separated, no punctuation, no quotes.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      callerUserId: userId,
      maxTokens: 30,
    });
    const q = res.text.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return q || description;
  } catch {
    return description;
  }
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** HTTP 상태 → 실패 사유. 401/403=키 오류, 429=한도, 나머지는 unknown(상태코드를 detail 에). */
function httpFailure(status: number): { reason: FailReason; detail: string } {
  if (status === 401 || status === 403) return { reason: "auth_error", detail: `${status}` };
  if (status === 429) return { reason: "rate_limit", detail: `${status}` };
  return { reason: "unknown", detail: `HTTP ${status}` };
}

type StockCandidate = { url: string; meta: Record<string, unknown> };

/**
 * 스톡 후보(상위 N장)를 순서대로 내려받아 심사, 첫 합격작 채택.
 * 심사 생략(skipped)이면 그 후보를 그대로 채택(종전 방식).
 */
async function pickStockCandidate(
  candidates: StockCandidate[],
  description: string,
  judge: JudgeContext
): Promise<ProviderResult> {
  let tried = 0;
  let downloaded = 0;
  const rejected: JudgeScore[] = [];
  for (const c of candidates.slice(0, STOCK_CANDIDATES)) {
    tried += 1;
    const buffer = await fetchBytes(c.url);
    if (!buffer) continue;
    downloaded += 1;
    const verdict = await judgeImage(judge, buffer, "image/jpeg", description);
    if (verdict.status === "fail") {
      rejected.push({ match: verdict.match, quality: verdict.quality, issues: verdict.issues });
      continue;
    }
    const judgeRecord: JudgeRecord =
      verdict.status === "pass"
        ? { verified: "pass", match: verdict.match, quality: verdict.quality, issues: verdict.issues, candidatesTried: tried, model: judge.model }
        : { verified: "skipped", reason: verdict.reason, candidatesTried: tried, model: judge.model };
    return {
      ok: true,
      candidatesTried: tried,
      rejected,
      sourced: { buffer, mimeType: "image/jpeg", ext: "jpg", source: "stock_free", meta: c.meta, judge: judgeRecord },
    };
  }
  if (downloaded === 0) return { ok: false, reason: "download_failed", detail: `${tried}장`, candidatesTried: tried };
  return { ok: false, reason: "judge_rejected", detail: `${rejected.length}장`, candidatesTried: tried, rejected };
}

async function searchUnsplash(query: string, key: string, description: string, judge: JudgeContext): Promise<ProviderResult> {
  let r: Response;
  try {
    r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${STOCK_CANDIDATES}&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` }, cache: "no-store" }
    );
  } catch (err) {
    return { ok: false, reason: "network_error", detail: errMsg(err) };
  }
  if (!r.ok) return { ok: false, ...httpFailure(r.status) };
  let data: { results?: Array<{ urls?: { regular?: string }; user?: { name?: string }; links?: { html?: string } }> };
  try {
    data = (await r.json()) as typeof data;
  } catch {
    return { ok: false, reason: "unknown", detail: "응답 파싱 실패" };
  }
  const candidates: StockCandidate[] = (data.results ?? [])
    .filter((h) => !!h.urls?.regular)
    .map((h) => ({ url: h.urls!.regular!, meta: { provider: "unsplash", query, author: h.user?.name, link: h.links?.html } }));
  if (!candidates.length) return { ok: false, reason: "no_result" };
  return pickStockCandidate(candidates, description, judge);
}

async function searchPexels(query: string, key: string, description: string, judge: JudgeContext): Promise<ProviderResult> {
  let r: Response;
  try {
    r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${STOCK_CANDIDATES}&orientation=landscape`,
      { headers: { Authorization: key }, cache: "no-store" }
    );
  } catch (err) {
    return { ok: false, reason: "network_error", detail: errMsg(err) };
  }
  if (!r.ok) return { ok: false, ...httpFailure(r.status) };
  let data: { photos?: Array<{ src?: { large?: string }; photographer?: string; url?: string }> };
  try {
    data = (await r.json()) as typeof data;
  } catch {
    return { ok: false, reason: "unknown", detail: "응답 파싱 실패" };
  }
  const candidates: StockCandidate[] = (data.photos ?? [])
    .filter((h) => !!h.src?.large)
    .map((h) => ({ url: h.src!.large!, meta: { provider: "pexels", query, author: h.photographer, link: h.url } }));
  if (!candidates.length) return { ok: false, reason: "no_result" };
  return pickStockCandidate(candidates, description, judge);
}

type GenResult =
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: false; reason: FailReason; detail?: string };

/**
 * AI 생성 공통: 생성 → 심사 → 불합격이면 issues 를 프롬프트에 반영해 1회 재생성 → 재심사.
 * 재심사도 불합격이면 judge_rejected. 심사 생략이면 첫 결과 채택.
 */
async function generateWithJudge(
  gen: (prompt: string) => Promise<GenResult>,
  provider: string,
  description: string,
  feedback: string | undefined,
  judge: JudgeContext
): Promise<ProviderResult> {
  const rejected: JudgeScore[] = [];
  let avoid: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const g = await gen(aiPrompt(description, feedback, avoid));
    if (!g.ok) {
      return { ok: false, reason: g.reason, detail: attempt === 2 ? `재생성 실패${g.detail ? ` · ${g.detail}` : ""}` : g.detail, candidatesTried: attempt, rejected };
    }
    const verdict = await judgeImage(judge, g.buffer, g.mimeType, description);
    if (verdict.status === "fail") {
      rejected.push({ match: verdict.match, quality: verdict.quality, issues: verdict.issues });
      avoid = verdict.issues;
      continue;
    }
    const judgeRecord: JudgeRecord =
      verdict.status === "pass"
        ? { verified: "pass", match: verdict.match, quality: verdict.quality, issues: verdict.issues, candidatesTried: attempt, model: judge.model }
        : { verified: "skipped", reason: verdict.reason, candidatesTried: attempt, model: judge.model };
    return {
      ok: true,
      candidatesTried: attempt,
      rejected,
      sourced: {
        buffer: g.buffer,
        mimeType: g.mimeType,
        ext: "png",
        source: "ai_generated",
        meta: { provider, prompt: description, ...(avoid.length ? { regeneratedFor: avoid } : {}) },
        judge: judgeRecord,
      },
    };
  }
  return { ok: false, reason: "judge_rejected", detail: `${rejected.length}회`, candidatesTried: 2, rejected };
}

async function genImagen(prompt: string, key: string): Promise<GenResult> {
  let r: Response;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "16:9" } }),
        cache: "no-store",
      }
    );
  } catch (err) {
    return { ok: false, reason: "network_error", detail: errMsg(err) };
  }
  if (!r.ok) {
    // Google 은 잘못된 키를 400(API_KEY_INVALID)/403 으로 돌려준다.
    if (r.status === 400) {
      const t = await r.text().catch(() => "");
      if (/API_KEY_INVALID|API key not valid/i.test(t)) return { ok: false, reason: "auth_error", detail: "400" };
      return { ok: false, reason: "unknown", detail: "HTTP 400" };
    }
    return { ok: false, ...httpFailure(r.status) };
  }
  let data: { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string; raiFilteredReason?: string }> };
  try {
    data = (await r.json()) as typeof data;
  } catch {
    return { ok: false, reason: "unknown", detail: "응답 파싱 실패" };
  }
  const p = data.predictions?.[0];
  if (!p?.bytesBase64Encoded) {
    if (p?.raiFilteredReason) return { ok: false, reason: "policy_blocked", detail: p.raiFilteredReason.slice(0, 60) };
    return { ok: false, reason: "no_result" };
  }
  return { ok: true, buffer: Buffer.from(p.bytesBase64Encoded, "base64"), mimeType: p.mimeType || "image/png" };
}

async function genOpenAI(prompt: string, key: string): Promise<GenResult> {
  try {
    const client = new OpenAI({ apiKey: key });
    // gpt-image-1 은 항상 b64_json 반환(response_format 파라미터 없음).
    const res = await client.images.generate({ model: "gpt-image-1", prompt, size: "1536x1024", n: 1 });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return { ok: false, reason: "no_result" };
    return { ok: true, buffer: Buffer.from(b64, "base64"), mimeType: "image/png" };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const code = String((err as { code?: string })?.code ?? "");
    const msg = errMsg(err);
    if (/moderation_blocked|content_policy|safety/i.test(code + " " + msg)) return { ok: false, reason: "policy_blocked", detail: msg.slice(0, 60) };
    if (status === 401 || status === 403) return { ok: false, reason: "auth_error", detail: `${status}` };
    if (status === 429 || /insufficient_quota|billing/i.test(code + " " + msg)) return { ok: false, reason: "rate_limit", detail: status ? `${status}` : code };
    if (msg.includes("fetch failed") || code === "ECONNRESET") return { ok: false, reason: "network_error", detail: msg.slice(0, 60) };
    return { ok: false, reason: "unknown", detail: (status ? `HTTP ${status} ` : "") + msg.slice(0, 60) };
  }
}

function aiPrompt(description: string, feedback?: string, avoid: string[] = []): string {
  const fb = feedback?.trim() ? ` Adjust per this feedback: ${feedback.trim()}.` : "";
  const av = avoid.length ? ` Avoid these problems found in a previous attempt: ${avoid.join("; ")}.` : "";
  return `${description}.${fb}${av} Editorial blog photograph, photorealistic, natural lighting, high quality, no text, no watermark, no logo.`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 시도 내역 → 사용자용 한 줄 요약 ("Unsplash: 검색 결과 없음 → Pexels: 키 오류(401)") */
export function describeAttempts(attempts: Attempt[]): string {
  return attempts
    .map((a) => {
      const label = SOURCE_LABEL[a.source];
      if (a.result === "adopted") return `${label}: 채택`;
      const reason = FAIL_REASON_LABEL[a.reason ?? "unknown"];
      return a.detail ? `${label}: ${reason}(${a.detail})` : `${label}: ${reason}`;
    })
    .join(" → ");
}

type SourceOutcome = { sourced: Sourced | null; attempts: Attempt[] };

async function runGroup(
  group: "stock" | "ai",
  cfg: ImageSourceConfig,
  run: (source: ImageSource) => Promise<ProviderResult | { skip: FailReason }>
): Promise<SourceOutcome> {
  const attempts: Attempt[] = [];
  const order: ImageSource[] = group === "stock" ? cfg.order.stock : cfg.order.ai;
  for (const source of order) {
    if (!cfg.enabled[source]) {
      attempts.push({ source, result: "skipped", reason: "disabled" });
      continue;
    }
    const r = await run(source);
    if ("skip" in r) {
      attempts.push({ source, result: "skipped", reason: r.skip });
      continue;
    }
    if (r.ok) {
      attempts.push({ source, result: "adopted", candidatesTried: r.candidatesTried, ...(r.rejected.length ? { rejected: r.rejected } : {}) });
      return { sourced: r.sourced, attempts };
    }
    attempts.push({
      source,
      result: "failed",
      reason: r.reason,
      detail: r.detail,
      candidatesTried: r.candidatesTried,
      ...(r.rejected?.length ? { rejected: r.rejected } : {}),
    });
  }
  return { sourced: null, attempts };
}

type SourceByModeResult =
  | { ok: true; sourced: Sourced; attempts: Attempt[]; judge: JudgeContext; query?: string }
  | { ok: false; error: string; attempts: Attempt[]; judge: JudgeContext; query?: string };

async function sourceByMode(mode: AutoMode, description: string, userId: string, feedback?: string): Promise<SourceByModeResult> {
  const res = await resolveImageSources(userId);
  const { keys, config } = res;
  const judge = createJudgeContext({ ...config.verify, openaiKey: res.openai });

  const stockOn = config.order.stock.filter((s) => config.enabled[s]);
  const aiOn = config.order.ai.filter((s) => config.enabled[s]);

  let query: string | undefined;
  const runStock = async (): Promise<SourceOutcome> => {
    const getQuery = async () => (query ??= await toEnglishQuery(description, userId, feedback));
    return runGroup("stock", config, async (source) => {
      if (source === "unsplash") {
        if (!keys.unsplash) return { skip: "no_key" };
        return searchUnsplash(await getQuery(), keys.unsplash, description, judge);
      }
      if (!keys.pexels) return { skip: "no_key" };
      return searchPexels(await getQuery(), keys.pexels, description, judge);
    });
  };

  const runAi = async (): Promise<SourceOutcome> =>
    runGroup("ai", config, async (source) => {
      if (source === "google_ai") {
        const k = keys.googleAi;
        if (!k) return { skip: "no_key" };
        return generateWithJudge((p) => genImagen(p, k), "imagen-3.0", description, feedback, judge);
      }
      // openai_image: 글 생성용 OpenAI 키 공용. 토글이 꺼져 있으면 runGroup 에서 이미 건너뛴다.
      const k = res.openai;
      if (!k) return { skip: "no_key" };
      return generateWithJudge((p) => genOpenAI(p, k), "gpt-image-1", description, feedback, judge);
    });

  const fail = (prefix: string, attempts: Attempt[]): SourceByModeResult => ({
    ok: false,
    error: `${prefix} — ${describeAttempts(attempts)}`,
    attempts,
    judge,
    query,
  });
  const success = (sourced: Sourced, attempts: Attempt[]): SourceByModeResult => ({ ok: true, sourced, attempts, judge, query });

  if (mode === "stock") {
    if (!stockOn.length)
      return { ok: false, error: "사용 중인 스톡 소스가 없습니다(설정에서 Unsplash/Pexels를 켜세요).", attempts: [], judge };
    const r = await runStock();
    if (r.sourced) return success(r.sourced, r.attempts);
    return fail("스톡 이미지를 가져오지 못했습니다", r.attempts);
  }
  if (mode === "ai") {
    if (!aiOn.length)
      return { ok: false, error: "사용 중인 AI 생성 소스가 없습니다(설정에서 Google Imagen/OpenAI gpt-image-1을 켜세요).", attempts: [], judge };
    const r = await runAi();
    if (r.sourced) return success(r.sourced, r.attempts);
    return fail("AI 이미지 생성에 실패했습니다", r.attempts);
  }
  // stock_then_ai
  if (!stockOn.length && !aiOn.length)
    return { ok: false, error: "사용 중인 이미지 소스가 없습니다(설정에서 스톡 또는 AI 소스를 켜세요).", attempts: [], judge };
  const s = await runStock();
  if (s.sourced) return success(s.sourced, s.attempts);
  const a = await runAi();
  const attempts = [...s.attempts, ...a.attempts];
  if (a.sourced) return success(a.sourced, attempts);
  return fail("스톡·AI 모두 실패했습니다", attempts);
}

export type AutoSourceResult =
  | { ok: true; provider: string; imageUrl: string; judge: JudgeRecord; attempts: Attempt[] }
  | { ok: false; error: string; attempts: Attempt[] };

/**
 * 사진 요청 1건을 자동 소싱해 저장하고 요청을 uploaded로 갱신한다.
 * feedback이 있으면 반려+재생성(검색어/프롬프트에 반영), 기존 이미지는 교체·삭제한다.
 */
export async function autoSourceForRequest(opts: {
  requestId: string;
  mode: AutoMode;
  userId: string;
  feedback?: string;
}): Promise<AutoSourceResult> {
  const req = await db.query.imageRequests.findFirst({
    where: eq(schema.imageRequests.id, opts.requestId),
    with: { draft: true },
  });
  if (!req) return { ok: false, error: "요청을 찾을 수 없습니다.", attempts: [] };

  const result = await sourceByMode(opts.mode, req.description, opts.userId, opts.feedback);
  const judgeSummary = {
    model: result.judge.model,
    calls: result.judge.calls,
    usage: result.judge.usage,
    estCostUsd: Number(estimateJudgeCostUsd(result.judge.usage).toFixed(5)),
  };
  console.log(
    "[image-sourcing]",
    JSON.stringify({
      requestId: opts.requestId,
      mode: opts.mode,
      ok: result.ok,
      query: result.query,
      ...(result.ok ? { provider: result.sourced.meta.provider, judge: result.sourced.judge } : { error: result.error }),
      attempts: result.attempts,
      judgeCalls: judgeSummary,
    })
  );
  if (!result.ok) return { ok: false, error: result.error, attempts: result.attempts };
  const { sourced, attempts } = result;

  const { urlPath, size } = await saveImageBuffer(sourced.buffer, sourced.ext);

  const [img] = await db
    .insert(schema.images)
    .values({
      blogId: req.draft.blogId,
      draftId: req.draftId,
      source: sourced.source,
      filePath: urlPath,
      mimeType: sourced.mimeType,
      fileSize: size,
      sourceMetaJson: JSON.stringify({
        slot: req.slot,
        ...sourced.meta,
        ...(opts.feedback?.trim() ? { feedback: opts.feedback.trim() } : {}),
        attempts,
        judge: sourced.judge,
        judgeCalls: judgeSummary,
      }),
    })
    .returning();

  // 이전 이미지(있으면) 교체 — 슬롯엔 1장만. 파일 + 행 정리.
  const prevImageId = req.uploadedImageId;

  await db
    .update(schema.imageRequests)
    .set({
      status: "uploaded",
      uploadedImageId: img.id,
      uploadedAt: new Date().toISOString(),
    })
    .where(eq(schema.imageRequests.id, opts.requestId));

  if (prevImageId && prevImageId !== img.id) {
    const prev = await db.query.images.findFirst({ where: eq(schema.images.id, prevImageId) });
    if (prev) {
      await deleteImageFile(prev.filePath);
      await db.delete(schema.images).where(eq(schema.images.id, prevImageId));
    }
  }

  return {
    ok: true,
    provider: String(sourced.meta.provider ?? sourced.source),
    imageUrl: img.filePath,
    judge: sourced.judge,
    attempts,
  };
}
