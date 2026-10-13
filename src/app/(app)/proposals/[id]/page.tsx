export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { currentValueFor, getProposalFor, proposedChange } from "@/lib/proposals";
import { STATUS_LABEL, STATUS_TONE, diffLines, displayValue, fieldLabel, type ProposalStatus } from "@/lib/proposals-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DecisionPanel } from "../decision-panel";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await getProposalFor(id, user);
  if (!p) notFound();
  const status = p.status as ProposalStatus;
  const change = proposedChange(p);
  const after = p.appliedAfter ?? change.after;
  const current = await currentValueFor(p);
  const beforeShown = displayValue(p.field, change.before || (p.target === "persona" ? current : ""), p.target);
  const afterShown = displayValue(p.field, after, p.target);
  const diff = diffLines(beforeShown, afterShown);
  const canDecide = p.target === "global_guide" ? user.role === "admin" : true;
  const targetLabel = p.target === "global_guide" ? "전체 글쓰기 가이드" : `${p.blog?.displayName ?? "블로그"} 페르소나`;

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link href="/proposals" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ChevronLeft className="size-4" /> 개선 제안함
        </Link>
      </div>
      <header className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Badge tone={STATUS_TONE[status]} data-testid="proposal-status">{STATUS_LABEL[status]}</Badge>
          <Badge tone="outline">{targetLabel}</Badge>
          {p.systemic && <Badge tone="amber">설정 자체 문제로 판단</Badge>}
          <Badge tone="neutral">{p.confidence === "high" ? "확신 높음" : "확신 보통"}</Badge>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight leading-tight">{fieldLabel(p.target, p.field)} 변경 제안</h1>
        <p className="mt-1 text-[12px] text-ink-400">
          {p.occurrenceCount}회 발견 · {new Date(p.createdAt).toLocaleString("ko-KR")}
          {p.decidedAt ? ` · 결정 ${new Date(p.decidedAt).toLocaleString("ko-KR")}${p.decider ? ` (${p.decider.name})` : ""}` : ""}
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardContent>
            <div className="text-sm font-bold mb-1.5">무엇이 문제인가</div>
            <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed" data-testid="proposal-problem">{p.problem}</p>
            {p.evidenceDrafts.length > 0 && (
              <div className="mt-3 text-xs text-ink-500">
                근거 초안:{" "}
                {p.evidenceDrafts.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && " · "}
                    <Link href={`/queue/${d.id}`} className="font-semibold text-accent-600 underline underline-offset-4">
                      {d.title}
                    </Link>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="text-sm font-bold mb-2">바꾸기 전 → 바꾼 뒤</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold text-ink-500 mb-1">바꾸기 전{p.target === "persona" && !change.before ? " (현재 값)" : ""}</div>
                <pre className="whitespace-pre-wrap rounded-lg bg-paper-100 p-3 text-[12px] leading-relaxed text-ink-700 max-h-72 overflow-auto" data-testid="before-text">{beforeShown || "(비어 있음)"}</pre>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-ink-500 mb-1">바꾼 뒤{p.appliedAfter ? " (수정 후 적용된 값)" : ""}</div>
                <pre className="whitespace-pre-wrap rounded-lg bg-leaf-100/60 p-3 text-[12px] leading-relaxed text-ink-800 max-h-72 overflow-auto" data-testid="after-text">{afterShown || "(비어 있음)"}</pre>
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-600">줄 단위 비교 보기</summary>
              <div className="mt-2 rounded-lg border border-paper-300 bg-paper-50 p-2 font-mono text-[11px] leading-relaxed max-h-80 overflow-auto" data-testid="diff-view">
                {diff.map((l, i) => (
                  <div key={i} className={l.type === "add" ? "bg-leaf-100 text-leaf-500" : l.type === "del" ? "bg-red-50 text-red-700 line-through" : "text-ink-500"}>
                    <span className="select-none pr-2">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
                    {l.text || " "}
                  </div>
                ))}
              </div>
            </details>
            {p.target === "global_guide" && p.status === "proposed" && (
              <p className="mt-2 text-[11px] text-ink-500">동의하면 가이드에서 «바꾸기 전» 문단을 찾아 «바꾼 뒤»로 교체합니다. 못 찾으면 가이드 끝에 새 항목으로 덧붙이고, 이전 전문은 설정 → 변경 이력에 보관됩니다.</p>
            )}
            {p.target === "persona" && p.status === "proposed" && (
              <p className="mt-2 text-[11px] text-ink-500">동의하면 페르소나의 새 버전이 만들어지고(이 항목만 바뀜) 이전 버전은 보관됩니다. 되돌리기는 이 화면에서.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="text-sm font-bold mb-2">결정</div>
            {p.status === "rejected" && <p className="mb-2 text-sm text-ink-600">거절함 — {p.rejectReason}</p>}
            {p.status === "applied" && <p className="mb-2 text-sm text-leaf-500 font-semibold" data-testid="applied-note">적용됨 ({p.appliedAt ? new Date(p.appliedAt).toLocaleString("ko-KR") : ""}). 되돌리기는 아래 버튼으로.</p>}
            {p.status === "rolled_back" && <p className="mb-2 text-sm text-amber-500 font-semibold">적용 전 설정으로 되돌렸습니다.</p>}
            {p.status === "pending" && <p className="mb-2 text-sm text-ink-500">집계 중 — 같은 문제가 다른 초안에서 한 번 더 발견되면 결정 요청으로 올라옵니다.</p>}
            <DecisionPanel id={p.id} status={p.status} after={afterShown} canDecide={canDecide} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
