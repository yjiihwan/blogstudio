"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  saveTelegramTokenAction,
  saveTelegramChatIdAction,
  testTelegramAction,
} from "./actions";

type TestResult = { ok: boolean; message: string } | null;

export function TelegramForm({
  tokenMasked: initialTokenMasked,
  chatIdMasked: initialChatIdMasked,
}: {
  tokenMasked: string | null;
  chatIdMasked: string | null;
}) {
  const [showToken, setShowToken] = useState(false);
  const [tokenMasked, setTokenMasked] = useState(initialTokenMasked);
  const [chatIdMasked, setChatIdMasked] = useState(initialChatIdMasked);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [tokenSavePending, startTokenSave] = useTransition();
  const [chatIdSavePending, startChatIdSave] = useTransition();
  const [testPending, startTest] = useTransition();

  function handleTokenSave(formData: FormData) {
    startTokenSave(async () => {
      const result = await saveTelegramTokenAction(formData);
      if (result.ok) {
        setTokenMasked(result.masked);
        setTestResult(null);
      }
    });
  }

  function handleChatIdSave(formData: FormData) {
    startChatIdSave(async () => {
      const result = await saveTelegramChatIdAction(formData);
      if (result.ok) {
        setChatIdMasked(result.masked);
        setTestResult(null);
      }
    });
  }

  function handleTest() {
    startTest(async () => {
      const result = await testTelegramAction();
      setTestResult(result);
    });
  }

  const isReady = !!tokenMasked && !!chatIdMasked;

  return (
    <div className="space-y-5">
      {/* Bot Token */}
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
        </p>
        <Button type="submit" size="sm" disabled={tokenSavePending}>
          {tokenSavePending && <Loader2 className="size-4 animate-spin" />}
          Bot Token 저장
        </Button>
      </form>

      <div className="border-t border-paper-300" />

      {/* Chat ID */}
      <form action={handleChatIdSave} className="space-y-1.5">
        <Label htmlFor="chatId">Chat ID</Label>
        {chatIdMasked && (
          <p className="text-xs text-ink-500 font-mono">{chatIdMasked}</p>
        )}
        <Input
          id="chatId"
          name="chatId"
          type="text"
          placeholder="-1001234567890 또는 123456789"
          autoComplete="off"
        />
        <p className="text-xs text-ink-500 leading-relaxed">
          개인 채팅: 봇에게 메시지 전송 후{" "}
          <a
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-600 underline underline-offset-4"
          >
            @userinfobot
          </a>
          에서 내 ID 확인. 그룹/채널: 봇을 관리자로 초대 후{" "}
          <code className="text-[11px]">getUpdates</code> API로 chat_id 확인.
        </p>
        <Button type="submit" size="sm" disabled={chatIdSavePending}>
          {chatIdSavePending && <Loader2 className="size-4 animate-spin" />}
          Chat ID 저장
        </Button>
      </form>

      <div className="border-t border-paper-300" />

      {/* Connection test */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={testPending || !isReady}
          onClick={handleTest}
          title={!isReady ? "Bot Token과 Chat ID를 먼저 저장해주세요." : undefined}
        >
          {testPending && <Loader2 className="size-4 animate-spin" />}
          연결 테스트
        </Button>
        {!isReady && (
          <span className="text-xs text-ink-400">
            Bot Token과 Chat ID를 모두 저장해야 테스트할 수 있습니다.
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
