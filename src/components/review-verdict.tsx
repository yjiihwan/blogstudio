"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HARD_FLAG_LABEL, VERDICT_LABEL, VERDICT_TONE, formatWon, type HardFlag, type ReviewMeta, type ReviewVerdict } from "@/lib/review-core";

export type ReviewInfo = {
  verdict: ReviewVerdict | null;
  reason: string | null;
  flags: HardFlag[];
  model: string | null;
  meta: ReviewMeta | null;
};

/** 큐·대시보드 카드용 작은 뱃지 */
export function VerdictBadge({ verdict }: { verdict: ReviewVerdict | null | undefined }) {
  if (!verdict) return null;
  return <Badge tone={VERDICT_TONE[verdict]} data-testid="verdict-badge">{VERDICT_LABEL[verdict]}</Badge>;
}

/** 검수 화면 우측 카드 — 점수 숫자 대신 판정 뱃지 + 사유 한 줄 + 주의 칩 */
export function ReviewVerdictCard({ review }: { review: ReviewInfo }) {
  const byModel = review.meta?.byModel ?? {};
  const models = Object.entries(byModel);
  return (
    <Card>
      <CardContent className="space-y-2" data-testid="review-card">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold">자동 검수</div>
          {review.verdict ? <VerdictBadge verdict={review.verdict} /> : <Badge tone="outline">검수 전</Badge>}
        </div>
        {review.reason ? (
          <p className="text-[13px] leading-relaxed text-ink-700" data-testid="review-reason">{review.reason}</p>
        ) : (
          <p className="text-[13px] text-ink-400">이 초안은 자동 검수 기록이 없습니다(개편 전 생성).</p>
        )}
        {review.flags.length > 0 && (
          <div className="flex flex-wrap gap-1" data-testid="review-flags">
            {review.flags.map((f) => (
              <span key={f} className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                ⚠ {HARD_FLAG_LABEL[f] ?? f}
              </span>
            ))}
          </div>
        )}
        {review.meta && (
          <p className="text-[11px] text-ink-400" data-testid="review-meta">
            {models.map(([m, v]) => `${m} ${v.calls}회`).join(" · ")}
            {models.length ? ` · ${formatWon(review.meta.costCents)}` : ""}
            {review.meta.revised ? " · 모델이 직접 수정함" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
