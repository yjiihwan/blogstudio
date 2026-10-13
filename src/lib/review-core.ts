/* 모델 검수(A안, 2026-10-13) — 순수 규칙(DB·네트워크 없음). 단위 테스트: scripts/test_review_core.ts
   · 검수 모델 응답(JSON) 관대한 파싱·검증
   · 사고 방지용 구조 체크: 사진 자리 마커 보존(개수·순서), 금지어·없는 시설 잔존
   · 판정/플래그 사람용 라벨
   품질 판단(분량·사람다움·SEO·흠 개수 등)은 전부 모델에 일임한다 — 여기에 숫자 기준을 다시 넣지 말 것. */
import { z } from "zod";

export const REVIEW_VERDICTS = ["approve", "revise", "reject"] as const;
export type ModelVerdict = (typeof REVIEW_VERDICTS)[number];
/** 저장 판정 = 모델 판정 + failed(응답 파싱 실패·타임아웃·모델 미연결 → 자동 승인 금지, 사람 검수) */
export type ReviewVerdict = ModelVerdict | "failed";

export const HARD_FLAGS = ["image_marker_lost", "absent_facility_used", "forbidden_word_used", "unfinished_slots"] as const;
export type HardFlag = (typeof HARD_FLAGS)[number];

export const HARD_FLAG_LABEL: Record<HardFlag, string> = {
  image_marker_lost: "사진 자리 유실",
  absent_facility_used: "없는 시설 언급",
  forbidden_word_used: "금지어 사용",
  unfinished_slots: "미완성 빈칸 남음",
};

export const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  approve: "검수 통과",
  revise: "검수 후 수정됨",
  reject: "검수 반려 권고",
  failed: "검수 실패",
};
export const VERDICT_TONE: Record<ReviewVerdict, "leaf" | "sky" | "accent" | "amber"> = {
  approve: "leaf",
  revise: "sky",
  reject: "accent",
  failed: "amber",
};

export const settingIssueSchema = z.object({
  target: z.enum(["global_guide", "persona"]),
  field: z.string().trim().min(1).max(80),
  problem: z.string().trim().min(1).max(2000),
  proposed_change: z.object({
    before: z.string().max(6000).default(""),
    after: z.string().max(6000).default(""),
  }),
  confidence: z.enum(["high", "medium"]).default("medium"),
  systemic: z.boolean().default(false),
});
export type SettingIssue = z.infer<typeof settingIssueSchema>;

const reviewSchema = z.object({
  verdict: z.enum(REVIEW_VERDICTS),
  reason: z.string().trim().max(1500).default(""),
  revised_body_md: z.string().nullable().optional(),
  hard_flags: z.array(z.string()).default([]),
  setting_issues: z.array(z.unknown()).default([]),
});

export type ParsedReview = {
  verdict: ModelVerdict;
  reason: string;
  revisedBodyMd: string | null;
  hardFlags: HardFlag[];
  settingIssues: SettingIssue[];
  /** 스키마에 안 맞아 버린 setting_issues 개수(로그용) */
  droppedIssues: number;
};

/** 코드펜스·앞뒤 잡음을 걷어내고 첫 '{' ~ 마지막 '}' 구간을 JSON 으로 읽는다. 실패 시 null. */
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct && typeof direct === "object") return direct;
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const inner = tryParse(cleaned.slice(a, b + 1));
  return inner && typeof inner === "object" ? inner : null;
}

export function parseReviewResponse(text: string): ParsedReview | null {
  const obj = extractJsonObject(text);
  if (!obj) return null;
  const r = reviewSchema.safeParse(obj);
  if (!r.success) return null;
  const flags = Array.from(
    new Set(r.data.hard_flags.filter((f): f is HardFlag => (HARD_FLAGS as readonly string[]).includes(f)))
  );
  let dropped = 0;
  const issues: SettingIssue[] = [];
  for (const raw of r.data.setting_issues.slice(0, 8)) {
    const p = settingIssueSchema.safeParse(raw);
    if (p.success) issues.push(p.data);
    else dropped++;
  }
  const revised = typeof r.data.revised_body_md === "string" ? stripFence(r.data.revised_body_md) : null;
  return {
    verdict: r.data.verdict,
    reason: r.data.reason || "",
    revisedBodyMd: revised && revised.trim().length > 0 ? revised : null,
    hardFlags: flags,
    settingIssues: issues,
    droppedIssues: dropped,
  };
}

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/* ───────── 사고 방지용 구조 체크(품질 판단 아님) ───────── */
const IMG_MARKER_RE = /<!--\s*IMG:slot=(\d+)\s*-->/g;

/** 본문의 사진 자리 마커를 등장 순서대로 돌려준다. */
export function imageMarkerSlots(bodyMd: string): number[] {
  const out: number[] = [];
  for (const m of (bodyMd ?? "").matchAll(IMG_MARKER_RE)) out.push(Number(m[1]));
  return out;
}

/** 수정본이 원본의 사진 자리(개수·순서)를 그대로 갖고 있는가. */
export function imageMarkersPreserved(originalMd: string, revisedMd: string): boolean {
  const a = imageMarkerSlots(originalMd);
  const b = imageMarkerSlots(revisedMd);
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function normalizeKo(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

/** 페르소나 금지어·없는 시설 키워드 잔존(띄어쓰기 무시). 반려 자동화가 아니라 표시용. */
export function findTermHits(text: string, terms: string[]): string[] {
  const hay = normalizeKo(text);
  const hits: string[] = [];
  for (const t of terms) {
    const needle = normalizeKo(t);
    if (needle.length < 1) continue;
    if (hay.includes(needle)) hits.push(t);
  }
  return hits;
}

export type ReviewCallMeta = { model: string; purpose: string; inTokens: number; outTokens: number; costCents: number };
export type ReviewMeta = {
  calls: ReviewCallMeta[];
  costCents: number;
  revised: boolean;
  at: string;
  /** 모델별 호출 횟수·비용 집계(보고용) */
  byModel: Record<string, { calls: number; costCents: number; inTokens: number; outTokens: number }>;
};

export function summarizeCalls(calls: ReviewCallMeta[], revised: boolean, at = new Date().toISOString()): ReviewMeta {
  const byModel: ReviewMeta["byModel"] = {};
  let cost = 0;
  for (const c of calls) {
    const m = (byModel[c.model] ??= { calls: 0, costCents: 0, inTokens: 0, outTokens: 0 });
    m.calls += 1;
    m.costCents += c.costCents;
    m.inTokens += c.inTokens;
    m.outTokens += c.outTokens;
    cost += c.costCents;
  }
  return { calls, costCents: cost, revised, at, byModel };
}

/** 비용(센트 단위 저장) → «약 1,230원» */
export function formatWon(costCents: number): string {
  return `약 ${Math.round(costCents / 100).toLocaleString("ko-KR")}원`;
}
