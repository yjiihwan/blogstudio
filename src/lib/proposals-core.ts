/* 설정 개선안 — 순수 규칙(DB·네트워크 없음). 단위 테스트: scripts/test_review_core.ts
   · 페르소나 적용 가능 항목 허용 목록·값 변환 · 전역 가이드 문단 교체 · 생성 규칙(즉시/보류/재제안 금지) · 줄 단위 diff · 사람용 라벨 */
import type { SettingIssue } from "./review-core";

export type ProposalTarget = "global_guide" | "persona";
export type ProposalStatus = "pending" | "proposed" | "accepted" | "applied" | "rejected" | "rolled_back" | "expired";

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "집계 중",
  proposed: "결정 대기",
  accepted: "동의함",
  applied: "적용됨",
  rejected: "거절함",
  rolled_back: "되돌림",
  expired: "만료",
};
export const STATUS_TONE: Record<ProposalStatus, "neutral" | "accent" | "leaf" | "amber" | "sky" | "dark" | "outline"> = {
  pending: "neutral",
  proposed: "accent",
  accepted: "sky",
  applied: "leaf",
  rejected: "neutral",
  rolled_back: "amber",
  expired: "outline",
};

export const REJECT_REASONS = [
  { value: "intended", label: "의도된 설정입니다" },
  { value: "insufficient", label: "근거가 부족합니다" },
  { value: "other", label: "기타" },
] as const;
export type RejectReasonValue = (typeof REJECT_REASONS)[number]["value"];

export const REPROPOSE_BLOCK_DAYS = 30;
/** 보류(pending) 항목이 제안으로 승격되는 «서로 다른 초안» 최소 수 */
export const PENDING_PROMOTE_DRAFTS = 2;

type FieldKind = "text" | "list" | "enum";
export type PersonaFieldSpec = { label: string; kind: FieldKind; enumValues?: readonly string[] };

/** 모델이 제안할 수 있는(=자동 적용 가능한) 페르소나 항목. 숫자(분량·이미지 수)·이모지 강도는 제외. */
export const PERSONA_FIELDS: Record<string, PersonaFieldSpec> = {
  purpose: { label: "블로그 목적", kind: "text" },
  audience: { label: "타겟 독자", kind: "text" },
  brandVoice: { label: "톤·말투", kind: "text" },
  formality: { label: "격식", kind: "enum", enumValues: ["informal", "neutral", "formal"] },
  pointOfView: { label: "화자(시점)", kind: "enum", enumValues: ["first_person", "owner", "third_person", "expert"] },
  focusKeywordsJson: { label: "핵심 키워드", kind: "list" },
  forbiddenWordsJson: { label: "금지어", kind: "list" },
  callsToActionJson: { label: "행동 유도 문구", kind: "list" },
  qualityRulesJson: { label: "품질 규칙", kind: "list" },
  facilitiesJson: { label: "실제 있는 시설·프로그램", kind: "list" },
  absentFacilitiesJson: { label: "없는 시설(언급 금지)", kind: "list" },
  sampleSnippetsJson: { label: "문체 예시", kind: "list" },
  notes: { label: "메모", kind: "text" },
};

/** 모델이 라벨/별칭으로 적어도 컬럼명으로 맞춘다. 모르면 null. */
export function normalizePersonaField(raw: string): string | null {
  const s = (raw || "").trim();
  if (PERSONA_FIELDS[s]) return s;
  const alias: Record<string, string> = {
    brand_voice: "brandVoice", tone: "brandVoice", voice: "brandVoice", "톤": "brandVoice", "말투": "brandVoice", "톤·말투": "brandVoice",
    forbiddenWords: "forbiddenWordsJson", forbidden_words: "forbiddenWordsJson", "금지어": "forbiddenWordsJson",
    facilities: "facilitiesJson", "시설": "facilitiesJson", absentFacilities: "absentFacilitiesJson", absent_facilities: "absentFacilitiesJson", "없는 시설": "absentFacilitiesJson",
    focusKeywords: "focusKeywordsJson", keywords: "focusKeywordsJson", "키워드": "focusKeywordsJson",
    ctas: "callsToActionJson", callsToAction: "callsToActionJson", ctas_json: "callsToActionJson",
    qualityRules: "qualityRulesJson", "품질 규칙": "qualityRulesJson",
    sampleSnippets: "sampleSnippetsJson", "문체 예시": "sampleSnippetsJson",
    point_of_view: "pointOfView", "화자": "pointOfView", "시점": "pointOfView", "격식": "formality",
    "목적": "purpose", "독자": "audience", "타겟 독자": "audience", "메모": "notes",
  };
  const key = alias[s] ?? alias[s.toLowerCase()];
  return key && PERSONA_FIELDS[key] ? key : null;
}

export function fieldLabel(target: ProposalTarget, field: string): string {
  if (target === "global_guide") return field ? `전체 글쓰기 가이드 · ${field}` : "전체 글쓰기 가이드";
  return PERSONA_FIELDS[field]?.label ?? field;
}

/** 모델의 setting_issue 를 저장 가능한 형태로 정리. 적용 불가 항목이면 null. */
export function normalizeIssue(issue: SettingIssue): SettingIssue | null {
  if (issue.target === "persona") {
    const f = normalizePersonaField(issue.field);
    if (!f) return null;
    const spec = PERSONA_FIELDS[f];
    if (spec.kind === "enum" && !spec.enumValues!.includes(issue.proposed_change.after.trim())) return null;
    if (!issue.proposed_change.after.trim()) return null;
    return { ...issue, field: f };
  }
  if (!issue.proposed_change.after.trim()) return null;
  return { ...issue, field: issue.field.trim() || "일반" };
}

/** 목록 항목 after 문자열 → string[] (JSON 배열 우선, 아니면 줄/쉼표 구분). */
export function parseListValue(after: string): string[] {
  const s = (after || "").trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s) as unknown;
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    /* fall through */
  }
  return s
    .split(/\r?\n|,|、|·/)
    .map((x) => x.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

/** 페르소나 컬럼에 쓸 실제 값. enum 위반 등이면 null(적용 거부). */
export function personaColumnValue(field: string, after: string): string | null {
  const spec = PERSONA_FIELDS[field];
  if (!spec) return null;
  if (spec.kind === "list") return JSON.stringify(parseListValue(after));
  if (spec.kind === "enum") return spec.enumValues!.includes(after.trim()) ? after.trim() : null;
  return after;
}

/** 사람이 읽는 표시용 값(목록은 줄바꿈). */
export function displayValue(field: string, value: string | null | undefined, target: ProposalTarget): string {
  if (value == null) return "";
  if (target === "persona" && PERSONA_FIELDS[field]?.kind === "list") {
    try {
      const j = JSON.parse(value) as unknown;
      if (Array.isArray(j)) return j.map(String).join("\n");
    } catch {
      /* 원문 그대로 */
    }
  }
  return value;
}

function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 전역 가이드 문단 교체. before 를 찾으면 그 자리 교체, 못 찾으면 끝에 섹션으로 덧붙임(appended). */
export function applyGuideChange(guideText: string, field: string, before: string, after: string): { text: string; mode: "replaced" | "appended" } {
  const b = (before || "").trim();
  const a = (after || "").trim();
  if (b && guideText.includes(b)) return { text: guideText.replace(b, a), mode: "replaced" };
  if (b) {
    // 공백 차이만 있는 경우를 줄 단위로 찾아 교체
    const lines = guideText.split("\n");
    const bLines = b.split("\n").map(normWs);
    for (let i = 0; i + bLines.length <= lines.length; i++) {
      if (bLines.every((bl, k) => normWs(lines[i + k]) === bl)) {
        const out = [...lines.slice(0, i), ...a.split("\n"), ...lines.slice(i + bLines.length)];
        return { text: out.join("\n"), mode: "replaced" };
      }
    }
  }
  const heading = field && !/^(일반|기타)$/.test(field) ? `## ${field.replace(/^#+\s*/, "")}` : "## 추가 규칙(개선 제안)";
  return { text: `${guideText.trimEnd()}\n\n${heading}\n${a}`, mode: "appended" };
}

/** 생성 규칙 — systemic 이고 확신이 high 면 즉시 제안, 아니면 보류 집계. */
export function shouldProposeImmediately(issue: Pick<SettingIssue, "systemic" | "confidence">): boolean {
  return issue.systemic === true && issue.confidence === "high";
}

/** 거절 뒤 30일 재제안 금지 */
export function isRejectBlocked(decidedAt: string | null | undefined, now = new Date()): boolean {
  if (!decidedAt) return false;
  const t = new Date(decidedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < REPROPOSE_BLOCK_DAYS * 86_400_000;
}

/** 보류 항목 승격 판정 — 서로 다른 초안 수 */
export function shouldPromotePending(evidenceDraftIds: string[]): boolean {
  return new Set(evidenceDraftIds.filter(Boolean)).size >= PENDING_PROMOTE_DRAFTS;
}

/* ───────── 줄 단위 diff(LCS) — before/after 비교 표시용 ───────── */
export type DiffLine = { type: "same" | "add" | "del"; text: string };
export function diffLines(a: string, b: string): DiffLine[] {
  const A = (a ?? "").split("\n");
  const B = (b ?? "").split("\n");
  const n = A.length;
  const m = B.length;
  if (n * m > 250_000) {
    // 너무 크면 통째로 삭제/추가로 표시(성능 보호)
    return [...A.map((t) => ({ type: "del" as const, text: t })), ...B.map((t) => ({ type: "add" as const, text: t }))];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: "same", text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: A[i] }); i++; }
    else { out.push({ type: "add", text: B[j] }); j++; }
  }
  while (i < n) out.push({ type: "del", text: A[i++] });
  while (j < m) out.push({ type: "add", text: B[j++] });
  return out;
}

/** 알림 문구용 한 줄 요약(개발 용어 없이). */
export function proposalSummaryLine(p: { target: ProposalTarget; field: string; problem: string }, blogName?: string | null): { 대상: string; 내용: string } {
  const 대상 = p.target === "global_guide" ? fieldLabel("global_guide", p.field) : `${blogName ?? "블로그"} 페르소나 · ${fieldLabel("persona", p.field)}`;
  const 내용 = p.problem.replace(/\s+/g, " ").trim().slice(0, 80);
  return { 대상, 내용 };
}
