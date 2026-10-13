"use client";

import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { SOURCE_LABEL } from "@/lib/image-source-config";
import type { Attempt, JudgeRecord } from "@/lib/image-sourcing";

/** 자동 소싱 결과의 심사 배지 («일치 8 · 품질 7» / «검증 생략») + 사유 툴팁 */
export function JudgeBadge({ judge, attempts }: { judge: JudgeRecord | null | undefined; attempts?: Attempt[] }) {
  if (!judge) return null;
  const rejectedLines = (attempts ?? [])
    .filter((a) => a.rejected?.length)
    .map((a) => `${SOURCE_LABEL[a.source]} 탈락 ${a.rejected!.length}장: ${a.rejected!.map((r) => `일치${r.match}·품질${r.quality}${r.issues.length ? `(${r.issues.slice(0, 2).join(", ")})` : ""}`).join(" / ")}`);

  if (judge.verified === "skipped") {
    return (
      <span className="inline-flex items-center gap-1">
        <Badge tone="neutral">검증 생략</Badge>
        <InfoTooltip label="검증 생략 사유">
          <p>사유: {judge.reason}</p>
          <p className="text-ink-500">후보 {judge.candidatesTried}장 · 모델 {judge.model}</p>
          {rejectedLines.map((l) => <p key={l} className="text-ink-500">{l}</p>)}
        </InfoTooltip>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone="leaf">일치 {judge.match} · 품질 {judge.quality}</Badge>
      <InfoTooltip label="심사 상세">
        <p>{judge.issues.length ? `지적: ${judge.issues.join(", ")}` : "지적 사항 없음"}</p>
        <p className="text-ink-500">후보 {judge.candidatesTried}장째 채택 · 모델 {judge.model}</p>
        {rejectedLines.map((l) => <p key={l} className="text-ink-500">{l}</p>)}
      </InfoTooltip>
    </span>
  );
}
