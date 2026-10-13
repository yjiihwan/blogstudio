"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveGlobalGuideAction, restoreGuideVersionAction, type GuideHistoryView } from "./actions";
import { History } from "lucide-react";

export function GlobalGuideForm({
  initialEnabled,
  initialText,
  defaultText,
  history = [],
}: {
  initialEnabled: boolean;
  initialText: string;
  defaultText: string;
  history?: GuideHistoryView[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [text, setText] = useState(initialText);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  function handleRestore(index: number) {
    if (!window.confirm("이 버전으로 되돌릴까요? 지금 내용은 이력에 보관됩니다.")) return;
    setRestoring(index);
    start(async () => {
      try {
        const res = await restoreGuideVersionAction(index);
        if (res.ok && typeof res.text === "string") {
          setText(res.text);
          setMsg({ ok: true, text: "되돌렸습니다 ✓ (새로고침하면 이력이 갱신됩니다)" });
        } else setMsg({ ok: false, text: res.error ?? "되돌리기 실패" });
      } catch {
        setMsg({ ok: false, text: "되돌리기 중 오류가 발생했습니다." });
      } finally {
        setRestoring(null);
      }
    });
  }

  function handleSave() {
    setMsg(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("enabled", enabled ? "on" : "");
        fd.set("text", text);
        const res = await saveGlobalGuideAction(fd);
        setMsg(res.ok ? { ok: true, text: "저장됨 ✓" } : { ok: false, text: res.error ?? "저장 실패" });
      } catch {
        setMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 적용 토글 */}
      <div className="flex items-center justify-between rounded-lg bg-paper-100 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">전체 가이드 적용</div>
          <div className="text-xs text-ink-500">
            끄면 이 규칙을 주입하지 않습니다(페르소나만 적용).
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          role="switch"
          aria-checked={enabled}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            enabled ? "bg-accent-500" : "bg-paper-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="guideText" className="text-sm font-medium">
            가이드 내용
          </label>
          <button
            type="button"
            onClick={() => setText(defaultText)}
            className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline underline-offset-4"
          >
            권장 기본값 불러오기
          </button>
        </div>
        <Textarea
          id="guideText"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          placeholder="모든 글에 무조건 적용할 규칙을 적으세요. (예: AI 티 나는 상투적 표현 금지 등)"
          className="font-mono text-[13px] leading-relaxed"
        />
        <p className="text-xs text-ink-500">
          여기 적은 규칙은 <strong>모든 블로그의 모든 초안 생성</strong>(완전자동·반자동·재작성)에
          페르소나보다 <strong>우선</strong> 적용됩니다.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          저장
        </Button>
        {!enabled && <Badge tone="neutral">현재 미적용</Badge>}
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>
            {msg.text}
          </span>
        )}
      </div>

      {/* 변경 이력 — 개선 제안 적용·직접 편집·되돌리기 때 직전 전문 보관(최근 20개) */}
      <div className="rounded-lg border border-paper-300 bg-paper-50" data-testid="guide-history">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold"
        >
          <span className="inline-flex items-center gap-1.5">
            <History className="size-4" /> 변경 이력 {history.length}건
          </span>
          <span className="text-xs text-ink-400">{showHistory ? "접기" : "펼치기"}</span>
        </button>
        {showHistory && (
          <ul className="divide-y divide-paper-200 border-t border-paper-200">
            {history.length === 0 && <li className="px-4 py-3 text-xs text-ink-400">아직 이력이 없습니다.</li>}
            {history.map((h) => (
              <li key={h.index} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-ink-800">
                    {new Date(h.at).toLocaleString("ko-KR")} · {h.reason}
                  </div>
                  <div className="truncate text-[11px] text-ink-500">{h.chars.toLocaleString()}자 · {h.preview}</div>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => handleRestore(h.index)} data-testid={`guide-restore-${h.index}`}>
                  {restoring === h.index ? <Loader2 className="size-3 animate-spin" /> : null}
                  이 버전으로 되돌리기
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
