/* 모델 검수 단계(A안, 2026-10-13) — 생성 파이프라인 끝에서 글 전체를 검수 모델(role="review", 글작성 모델과 다른
   모델·추론 high)에 맡긴다. revise 는 최대 1회: 1차 호출이 수정본을 내면 그 수정본을 2차 호출로 재검수(approve/reject 만).
   응답 파싱 실패·타임아웃·모델 미연결 → verdict "failed"(자동 승인 금지, 사람 검수행).
   남기는 안전장치(코드): 사진 자리 마커 보존, 없는 시설·금지어 잔존 → hard_flag 표시(반려 자동화 아님). */
import { llm } from "./llm";
import { REVIEW_SYSTEM_PROMPT, reviewUserPrompt } from "./llm/review-prompts";
import {
  findTermHits,
  imageMarkersPreserved,
  parseReviewResponse,
  summarizeCalls,
  type HardFlag,
  type ReviewCallMeta,
  type ReviewMeta,
  type ReviewVerdict,
  type SettingIssue,
} from "./review-core";
import { personaPreamble, type PersonaInput } from "./llm/prompts";

const REVIEW_TIMEOUT_MS = Number(process.env.REVIEW_TIMEOUT_MS ?? 300_000);

export type ModelReviewResult = {
  verdict: ReviewVerdict;
  reason: string;
  /** 최종 본문(revise 채택 시 수정본, 아니면 원본) */
  bodyMd: string;
  hardFlags: HardFlag[];
  settingIssues: SettingIssue[];
  revised: boolean;
  model: string;
  meta: ReviewMeta;
  inTokens: number;
  outTokens: number;
  costCents: number;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("REVIEW_TIMEOUT")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function runModelReview(opts: {
  persona: PersonaInput;
  title: string;
  bodyMd: string;
  guideText: string;
  factsText?: string;
  styleSamplesText?: string;
  callerUserId?: string;
  /** false = 판정만(사람 피드백 재작성 경로). 기본 true. */
  allowRevise?: boolean;
}): Promise<ModelReviewResult> {
  const allowRevise = opts.allowRevise ?? true;
  const calls: ReviewCallMeta[] = [];
  const personaText = personaPreamble(opts.persona);
  const bodyChars = opts.bodyMd.replace(/\s+/g, "").length;
  // 수정 전문 + 추론 토큰을 담을 천장(한국어 ~2.2토큰/자). 작은 글도 JSON·추론 여유 확보.
  const maxTokens = Math.min(24000, Math.max(6000, Math.round(bodyChars * 2.2) + 3000));
  let model = "";

  const failed = (reason: string, finalBody = opts.bodyMd): ModelReviewResult => {
    const meta = summarizeCalls(calls, false);
    return {
      verdict: "failed",
      reason,
      bodyMd: finalBody,
      hardFlags: codeFlags(opts.persona, opts.title, finalBody),
      settingIssues: [],
      revised: false,
      model: model || "(없음)",
      meta,
      inTokens: calls.reduce((a, c) => a + c.inTokens, 0),
      outTokens: calls.reduce((a, c) => a + c.outTokens, 0),
      costCents: meta.costCents,
    };
  };

  const call = async (bodyMd: string, allow: boolean, priorReason?: string, purpose = "검수") => {
    const res = await withTimeout(
      llm({
        role: "review",
        system: REVIEW_SYSTEM_PROMPT,
        callerUserId: opts.callerUserId,
        maxTokens,
        messages: [
          {
            role: "user",
            content: reviewUserPrompt({
              title: opts.title,
              bodyMd,
              guideText: opts.guideText,
              personaText,
              factsText: opts.factsText,
              styleSamplesText: opts.styleSamplesText,
              allowRevise: allow,
              priorReason,
            }),
          },
        ],
      }),
      REVIEW_TIMEOUT_MS
    );
    model = res.model;
    calls.push({ model: res.model, purpose, inTokens: res.inputTokens, outTokens: res.outputTokens, costCents: res.costCents });
    return res;
  };

  try {
    // ── 1차 검수 ──
    let first = await call(opts.bodyMd, allowRevise);
    if (first.isMock) {
      return failed("검수 모델이 연결되지 않아(API 키 없음) 자동 검수를 하지 못했습니다. 직접 검토해 주세요.");
    }
    let parsed = parseReviewResponse(first.text);
    if (!parsed) {
      // 응답 형식 오류 → 1회만 재요청(루프 금지). 그래도 실패면 failed.
      first = await call(opts.bodyMd, allowRevise, "직전 응답이 JSON 형식이 아니었습니다. JSON 객체 하나만 출력하세요.", "검수(형식 재요청)");
      parsed = parseReviewResponse(first.text);
      if (!parsed) return failed("검수 모델의 응답을 읽을 수 없었습니다(형식 오류). 직접 검토해 주세요.");
    }

    let finalBody = opts.bodyMd;
    let verdict: ReviewVerdict = parsed.verdict;
    let reason = parsed.reason;
    let revised = false;
    const flags = new Set<HardFlag>(parsed.hardFlags);
    const issues = parsed.settingIssues;

    if (allowRevise && parsed.verdict === "revise") {
      if (parsed.revisedBodyMd && imageMarkersPreserved(opts.bodyMd, parsed.revisedBodyMd)) {
        // ── 2차: 수정본 재검수(approve/reject 만, 더 이상 수정 없음) ──
        const second = await call(parsed.revisedBodyMd, false, parsed.reason, "수정본 재검수");
        const p2 = parseReviewResponse(second.text);
        if (!p2) {
          // 수정본 재검수 응답 불량 → 수정본은 채택하되 사람 검수로(failed 아님: 1차 판정은 유효). 사유에 명시.
          finalBody = parsed.revisedBodyMd;
          revised = true;
          verdict = "revise";
          reason = `${parsed.reason} (수정본 재검수 응답을 읽지 못해 직접 확인 필요)`;
        } else {
          finalBody = parsed.revisedBodyMd;
          revised = true;
          verdict = p2.verdict === "reject" ? "reject" : "revise";
          reason = p2.verdict === "reject" ? `수정 후에도 반려: ${p2.reason}` : `수정함 — ${parsed.reason}${p2.reason ? ` / 재검수: ${p2.reason}` : ""}`;
          p2.hardFlags.forEach((f) => flags.add(f));
          p2.settingIssues.forEach((si) => issues.push(si));
        }
      } else {
        // 수정본이 없거나 사진 자리를 잃음 → 원본 유지 + 표시. 사람 검수.
        if (parsed.revisedBodyMd) flags.add("image_marker_lost");
        verdict = "revise";
        reason = `${parsed.reason}${parsed.revisedBodyMd ? " (모델 수정본이 사진 자리를 잃어 원본을 유지했습니다 — 직접 확인 필요)" : " (모델이 수정본을 내지 않아 원본을 유지했습니다)"}`;
      }
    } else if (!allowRevise && parsed.verdict === "revise") {
      verdict = "reject";
    }

    codeFlags(opts.persona, opts.title, finalBody).forEach((f) => flags.add(f));
    const meta = summarizeCalls(calls, revised);
    return {
      verdict,
      reason,
      bodyMd: finalBody,
      hardFlags: [...flags],
      settingIssues: issues.slice(0, 5),
      revised,
      model,
      meta,
      inTokens: calls.reduce((a, c) => a + c.inTokens, 0),
      outTokens: calls.reduce((a, c) => a + c.outTokens, 0),
      costCents: meta.costCents,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[review] 모델 검수 실패:", msg);
    return failed(
      msg === "REVIEW_TIMEOUT"
        ? "검수 모델 응답이 제한 시간을 넘겨 자동 검수를 마치지 못했습니다. 직접 검토해 주세요."
        : `검수 모델 호출에 실패했습니다(${msg.slice(0, 120)}). 직접 검토해 주세요.`
    );
  }
}

/** 코드 안전장치 — 페르소나 '없는 시설'·금지어 잔존(표시만). */
function codeFlags(persona: PersonaInput, title: string, bodyMd: string): HardFlag[] {
  const text = `${title}\n${bodyMd}`;
  const out: HardFlag[] = [];
  if (findTermHits(text, persona.absentFacilities ?? []).length) out.push("absent_facility_used");
  if (findTermHits(text, persona.forbiddenWords ?? []).length) out.push("forbidden_word_used");
  return out;
}
