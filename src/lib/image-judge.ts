/**
 * 이미지 품질·묘사 일치 심사. OpenAI 비전 모델에 이미지+한국어 묘사를 보내
 * {match, quality, issues} 를 받고 기준(minMatch/minQuality) 으로 합격 판정.
 * 안전장치: 키 없음·호출 오류·JSON 파싱 실패 → "skipped"(종전처럼 즉시 채택), 요청당 호출 상한.
 */
import OpenAI from "openai";
import { env } from "./env";

export const JUDGE_MAX_CALLS_PER_REQUEST = 8;

export type JudgeScore = { match: number; quality: number; issues: string[] };

export type JudgeVerdict =
  | ({ status: "pass" } & JudgeScore)
  | ({ status: "fail" } & JudgeScore)
  | { status: "skipped"; reason: string };

export type JudgeContext = {
  enabled: boolean;
  minMatch: number;
  minQuality: number;
  model: string;
  client: OpenAI | null;
  /** 심사를 아예 못 하는 이유(키 없음 등). 있으면 모든 심사가 skipped. */
  unavailableReason: string | null;
  calls: number;
  maxCalls: number;
  /** 심사 토큰 사용량 합계(비용 추정용) */
  usage: { prompt: number; completion: number };
};

export function createJudgeContext(opts: {
  enabled: boolean;
  minMatch: number;
  minQuality: number;
  openaiKey: string | null;
}): JudgeContext {
  return {
    enabled: opts.enabled,
    minMatch: opts.minMatch,
    minQuality: opts.minQuality,
    model: env.OPENAI_MODEL_IMAGE_JUDGE,
    client: opts.openaiKey ? new OpenAI({ apiKey: opts.openaiKey }) : null,
    unavailableReason: opts.enabled && !opts.openaiKey ? "OpenAI 키 없음" : null,
    calls: 0,
    maxCalls: JUDGE_MAX_CALLS_PER_REQUEST,
    usage: { prompt: 0, completion: 0 },
  };
}

export function judgeBudgetLeft(ctx: JudgeContext): boolean {
  return ctx.calls < ctx.maxCalls;
}

const SYSTEM_PROMPT = [
  "You are a strict photo editor reviewing a candidate image for a Korean blog post.",
  "You receive the image and a Korean description of what the image should show.",
  "Score two things from 0 to 10:",
  "- match: does the image contain the key subject(s), place type and situation of the description? 10 = exactly, 0 = unrelated.",
  "  The image comes from a stock library or an AI generator, so it can never show the specific business name or brand",
  "  mentioned in the description. Do not lower match for a missing brand name; judge whether the kind of place,",
  "  subject and situation fit (e.g. a gym entrance for a gym entrance request). A different kind of place is a low match.",
  "- quality: is it usable as an editorial blog photo? Penalize: random or garbled text, watermarks, logos,",
  "  AI artifacts (distorted hands/faces/limbs, melted objects), blur, very low resolution, bad composition, clutter.",
  "List concrete problems in `issues` (Korean, short phrases). Empty array if none.",
  'Respond with ONLY JSON: {"match": number, "quality": number, "issues": string[]}',
].join("\n");

/**
 * 이미지 1장 심사. pass/fail/skipped 중 하나. 예외는 절대 던지지 않는다.
 */
export async function judgeImage(
  ctx: JudgeContext,
  buffer: Buffer,
  mimeType: string,
  description: string
): Promise<JudgeVerdict> {
  if (!ctx.enabled) return { status: "skipped", reason: "자동 검증 꺼짐" };
  if (ctx.unavailableReason || !ctx.client) {
    return { status: "skipped", reason: ctx.unavailableReason ?? "OpenAI 키 없음" };
  }
  if (!judgeBudgetLeft(ctx)) {
    return { status: "skipped", reason: `심사 호출 상한(${ctx.maxCalls}회) 초과` };
  }
  ctx.calls += 1;

  try {
    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
    const res = await ctx.client.chat.completions.create({
      model: ctx.model,
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Description (Korean): ${description}` },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    });
    ctx.usage.prompt += res.usage?.prompt_tokens ?? 0;
    ctx.usage.completion += res.usage?.completion_tokens ?? 0;

    const text = res.choices?.[0]?.message?.content ?? "";
    const parsed = parseScore(text);
    if (!parsed) return { status: "skipped", reason: "심사 응답 파싱 실패" };

    const pass = parsed.match >= ctx.minMatch && parsed.quality >= ctx.minQuality;
    return pass ? { status: "pass", ...parsed } : { status: "fail", ...parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "skipped", reason: `심사 호출 오류: ${msg.slice(0, 80)}` };
  }
}

function parseScore(text: string): JudgeScore | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as { match?: unknown; quality?: unknown; issues?: unknown };
    const match = Number(o.match);
    const quality = Number(o.quality);
    if (!Number.isFinite(match) || !Number.isFinite(quality)) return null;
    const issues = Array.isArray(o.issues)
      ? o.issues.filter((s): s is string => typeof s === "string").slice(0, 8)
      : [];
    return {
      match: Math.min(10, Math.max(0, Math.round(match))),
      quality: Math.min(10, Math.max(0, Math.round(quality))),
      issues,
    };
  } catch {
    return null;
  }
}

/** 심사 토큰 → 대략 비용(USD). 단가는 gpt-5.4-mini 기준(입력 $0.75 / 출력 $4.50 per 1M). */
export function estimateJudgeCostUsd(usage: { prompt: number; completion: number }): number {
  return (usage.prompt * 0.75 + usage.completion * 4.5) / 1_000_000;
}
