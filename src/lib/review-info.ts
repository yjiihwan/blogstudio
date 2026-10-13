import type { ReviewInfo } from "@/components/review-verdict";
import { HARD_FLAGS, type HardFlag, type ReviewMeta, type ReviewVerdict } from "./review-core";

/** drafts 행의 검수 컬럼 → 화면용 객체(JSON 파싱 관대). */
export function parseReviewInfo(d: {
  reviewVerdict: string | null;
  reviewReason: string | null;
  reviewFlagsJson: string | null;
  reviewModel: string | null;
  reviewMetaJson: string | null;
}): ReviewInfo {
  let flags: HardFlag[] = [];
  try {
    const arr = JSON.parse(d.reviewFlagsJson || "[]") as unknown;
    if (Array.isArray(arr)) flags = arr.filter((f): f is HardFlag => (HARD_FLAGS as readonly string[]).includes(String(f)));
  } catch {
    flags = [];
  }
  let meta: ReviewMeta | null = null;
  try {
    meta = d.reviewMetaJson ? (JSON.parse(d.reviewMetaJson) as ReviewMeta) : null;
  } catch {
    meta = null;
  }
  const v = d.reviewVerdict;
  const verdict: ReviewVerdict | null = v === "approve" || v === "revise" || v === "reject" || v === "failed" ? v : null;
  return { verdict, reason: d.reviewReason, flags, model: d.reviewModel, meta };
}
