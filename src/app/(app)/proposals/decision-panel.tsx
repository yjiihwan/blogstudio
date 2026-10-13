"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REJECT_REASONS } from "@/lib/proposals-core";
import { acceptProposalAction, rejectProposalAction, rollbackProposalAction } from "./actions";

type Result = { ok: true; note?: string } | { ok: false; error: string };

export function DecisionPanel({
  id,
  status,
  after,
  canDecide,
}: {
  id: string;
  status: string;
  after: string;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "reject">("idle");
  const [edited, setEdited] = useState(after);
  const [reason, setReason] = useState<string>(REJECT_REASONS[0].value);
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(action: (fd: FormData) => Promise<Result>, fd: FormData) {
    setMsg(null);
    start(async () => {
      try {
        const r = await action(fd);
        if (r.ok) {
          setMsg({ ok: true, text: r.note ?? "처리했습니다." });
          setMode("idle");
          router.refresh();
        } else setMsg({ ok: false, text: r.error });
      } catch {
        setMsg({ ok: false, text: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
      }
    });
  }

  const accept = (withEdit: boolean) => {
    const fd = new FormData();
    fd.set("id", id);
    if (withEdit) fd.set("editedAfter", edited);
    run(acceptProposalAction, fd);
  };
  const reject = () => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", reason);
    fd.set("detail", detail);
    run(rejectProposalAction, fd);
  };
  const rollback = () => {
    if (!window.confirm("적용 전 설정으로 되돌릴까요?")) return;
    const fd = new FormData();
    fd.set("id", id);
    run(rollbackProposalAction, fd);
  };

  if (!canDecide) {
    return <p className="text-sm text-ink-500">이 제안을 결정할 권한이 없습니다(열람만 가능).</p>;
  }

  return (
    <div className="space-y-3" data-testid="decision-panel">
      {(status === "proposed" || status === "accepted") && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" disabled={pending} onClick={() => accept(false)} data-testid="btn-accept">
              {pending && mode === "idle" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              동의 (바로 적용)
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setMode(mode === "edit" ? "idle" : "edit")} data-testid="btn-edit">
              <Pencil className="size-4" /> 수정 후 적용
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setMode(mode === "reject" ? "idle" : "reject")} data-testid="btn-reject">
              <XCircle className="size-4" /> 거절
            </Button>
          </div>
          {mode === "edit" && (
            <div className="space-y-2 rounded-lg border border-paper-300 bg-paper-50 p-3">
              <Label htmlFor="editedAfter">적용할 내용 (바꾼 뒤 값)</Label>
              <Textarea id="editedAfter" rows={6} value={edited} onChange={(e) => setEdited(e.target.value)} className="font-mono text-[13px]" />
              <p className="text-[11px] text-ink-500">목록 항목(금지어·시설 등)은 한 줄에 하나씩 적어도 됩니다.</p>
              <Button variant="accent" size="sm" disabled={pending || !edited.trim()} onClick={() => accept(true)} data-testid="btn-accept-edited">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} 이 내용으로 적용
              </Button>
            </div>
          )}
          {mode === "reject" && (
            <div className="space-y-2 rounded-lg border border-paper-300 bg-paper-50 p-3">
              <Label>거절 사유</Label>
              <div className="flex flex-wrap gap-1.5">
                {REJECT_REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`rounded-md px-3 py-2 text-[12px] font-semibold ${reason === r.value ? "bg-accent-500 text-white" : "bg-paper-200 text-ink-600 hover:bg-paper-300"}`}
                    data-testid={`reject-${r.value}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="(선택) 한 줄 메모" />
              <Button variant="danger" size="sm" disabled={pending} onClick={reject} data-testid="btn-reject-confirm">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} 거절 확정
              </Button>
              <p className="text-[11px] text-ink-500">거절한 내용과 같은 제안은 30일 동안 다시 올라오지 않습니다.</p>
            </div>
          )}
        </>
      )}
      {status === "applied" && (
        <Button variant="outline" disabled={pending} onClick={rollback} data-testid="btn-rollback">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} 적용 전으로 되돌리기
        </Button>
      )}
      {msg && (
        <div className={`rounded px-3 py-2 text-sm ${msg.ok ? "bg-leaf-100 text-leaf-500" : "bg-red-50 text-red-700 border border-red-200"}`} data-testid="decision-msg">
          {msg.text}
        </div>
      )}
    </div>
  );
}
