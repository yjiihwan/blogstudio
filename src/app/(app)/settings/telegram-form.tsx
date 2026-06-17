"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveTelegramTokenAction, testTelegramAction } from "./actions";

type TestResult = { ok: boolean; message: string } | null;

export function TelegramForm({
  tokenMasked: initialTokenMasked,
}: {
  tokenMasked: string | null;
}) {
  const [showToken, setShowToken] = useState(false);
  const [tokenMasked, setTokenMasked] = useState(initialTokenMasked);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tokenSavePending, startTokenSave] = useTransition();
  const [testPending, startTest] = useTransition();

  function handleTokenSave(formData: FormData) {
    setSaveMsg(null);
    startTokenSave(async () => {
      try {
        const result = await saveTelegramTokenAction(formData);
        if (result.ok) {
          setTokenMasked(result.masked);
          setTestResult(null);
          setSaveMsg({ ok: true, text: "저장됨 ✓" });
        } else {
          setSaveMsg({ ok: false, text: result.error });
        }
      } catch {
        setSaveMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
      }
    });
  }

  function handleTest() {
    startTest(async () => {
      const result = await testTelegramAction();
      setTestResult(result);
    });
  }

  const isReady = !!tokenMasked;

  return (
    <div className="space-y-5">
      {/* Bot Token — 어드민 전용 (시스템 자원) */}
      <form action={handleTokenSave} className="space-y-1.5">
        <Label htmlFor="botToken">Bot Token</Label>
        {tokenMasked && (
          <p className="text-xs text-ink-500 font-mono">{tokenMasked}</p>
        )}
        <div className="relative">
          <Input
            id="botToken"
            name="botToken"
            type={showToken ? "text" : "password"}
            placeholder="1234567890:ABCDefgh..."
            className="pr-10"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
            tabIndex={-1}
            aria-label={showToken ? "숨기기" : "보기"}
          >
            {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">
          텔레그램에서{" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-600 underline underline-offset-4"
          >
            @BotFather
          </a>
          에게 <code className="text-[11px]">/newbot</code> 명령으로 봇 생성 후 토큰을 복사하세요.
          개별 알림 수신은 각 계정의 <strong>내 계정 → 텔레그램 알림</strong>에서 Chat ID를 등록하면 됩니다.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="submit" size="sm" disabled={tokenSavePending}>
            {tokenSavePending && <Loader2 className="size-4 animate-spin" />}
            Bot Token 저장
          </Button>
          {saveMsg && (
            <span className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </form>

      <div className="border-t border-paper-300" />

      {/* Token validity test */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={testPending || !isReady}
          onClick={handleTest}
          title={!isReady ? "Bot Token을 저장해야 검증할 수 있습니다." : undefined}
        >
          {testPending && <Loader2 className="size-4 animate-spin" />}
          Bot Token 검증
        </Button>
        {!isReady && (
          <span className="text-xs text-ink-400">
            Bot Token을 저장해야 검증할 수 있습니다.
          </span>
        )}
        {testResult && (
          <Badge tone={testResult.ok ? "leaf" : "amber"}>
            {testResult.message}
          </Badge>
        )}
      </div>
    </div>
  );
}
