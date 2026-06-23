"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveGlobalGuideAction } from "./actions";

export function GlobalGuideForm({
  initialEnabled,
  initialText,
  defaultText,
}: {
  initialEnabled: boolean;
  initialText: string;
  defaultText: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [text, setText] = useState(initialText);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    </div>
  );
}
