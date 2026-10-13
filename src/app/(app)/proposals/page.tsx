export const dynamic = "force-dynamic";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listProposalsFor, proposalStats } from "@/lib/proposals";
import { STATUS_LABEL, STATUS_TONE, fieldLabel, type ProposalStatus } from "@/lib/proposals-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";

const ORDER: ProposalStatus[] = ["proposed", "accepted", "applied", "rolled_back", "rejected", "pending", "expired"];

export default async function ProposalsPage() {
  const user = await requireUser();
  const rows = await listProposalsFor(user);
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.status as ProposalStatus) - ORDER.indexOf(b.status as ProposalStatus));
  const open = rows.filter((r) => r.status === "proposed").length;
  const stats = user.role === "admin" ? await proposalStats() : null;

  return (
    <div className="px-5 lg:px-10 py-8 lg:py-12 max-w-3xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-bold tracking-[0.18em] text-accent-600 uppercase mb-1.5">Proposals</div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">개선 제안함</h1>
          {open > 0 && <Badge tone="accent" data-testid="open-count">결정 대기 {open}건</Badge>}
        </div>
        <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">
          자동 검수가 글을 읽다가 <strong>글쓰기 가이드나 페르소나 설정 자체</strong>에 문제가 있다고 판단하면 여기로 제안을 보냅니다.
          동의하면 설정이 바뀌고, 언제든 되돌릴 수 있습니다. 동의 없이 바뀌는 일은 없습니다.
        </p>
      </header>

      {stats && (
        <Card className="mb-5">
          <CardContent>
            <div className="text-sm font-bold mb-2">전체 현황 (관리자)</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center" data-testid="proposal-stats">
              <Stat label="생성" value={stats.total} />
              <Stat label="결정 대기" value={stats.proposed} />
              <Stat label="적용" value={stats.applied} />
              <Stat label="거절" value={stats.rejected} />
              <Stat label="되돌림" value={stats.rolledBack} />
              <Stat label="집계 중" value={stats.pending} />
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              거절 비율 {stats.rejectRate == null ? "—" : `${stats.rejectRate}%`} · 거절이 잦으면 검수 기준(프롬프트)을 다시 조정할 신호입니다. «집계 중»은 같은 문제가 다른 초안에서 한 번 더 나오면 제안으로 올라옵니다.
            </p>
          </CardContent>
        </Card>
      )}

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-500">
            <Lightbulb className="mx-auto mb-2 size-6 text-ink-300" />
            아직 받은 제안이 없습니다. 초안이 검수될 때 설정 문제가 발견되면 여기에 쌓입니다.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2" data-testid="proposal-list">
          {sorted.map((p) => (
            <li key={p.id}>
              <Link href={`/proposals/${p.id}`} className="block">
                <Card className="hover:border-ink-300 transition">
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge tone={STATUS_TONE[p.status as ProposalStatus]}>{STATUS_LABEL[p.status as ProposalStatus]}</Badge>
                      <Badge tone="outline">{p.target === "global_guide" ? "전체 가이드" : `${p.blogName ?? "블로그"} 페르소나`}</Badge>
                      <span className="text-[11px] text-ink-400">{relativeTime(p.updatedAt)}</span>
                      {p.occurrenceCount > 1 && <span className="text-[11px] text-ink-400">· {p.occurrenceCount}회 발견</span>}
                    </div>
                    <div className="font-semibold text-ink-900 leading-snug">{fieldLabel(p.target, p.field)}</div>
                    <p className="mt-0.5 text-sm text-ink-600 line-clamp-2">{p.problem}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-paper-100 px-2 py-2">
      <div className="text-lg font-black text-ink-900">{value}</div>
      <div className="text-[11px] text-ink-500">{label}</div>
    </div>
  );
}
