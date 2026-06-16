"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  saveLLMProviderAction,
  saveUserOpenAIKeyAction,
  testUserOpenAIKeyAction,
  saveUserApiKeyAction,
  testUserApiKeyAction,
} from "./actions";

type TestResult = { ok: boolean; message: string } | null;

export function LLMProviderForm({
  initialProvider,
  initialAnthropicMasked,
  initialOpenAIMasked,
}: {
  initialProvider: "anthropic" | "openai";
  initialAnthropicMasked: string | null;
  initialOpenAIMasked: string | null;
}) {
  const [provider, setProvider] = useState<"anthropic" | "openai">(initialProvider);
  const [anthropicMasked, setAnthropicMasked] = useState(initialAnthropicMasked);
  const [openaiMasked, setOpenaiMasked] = useState(initialOpenAIMasked);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [anthropicTestResult, setAnthropicTestResult] = useState<TestResult>(null);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerPending, startProvider] = useTransition();
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();
  const [anthropicSavePending, startAnthropicSave] = useTransition();
  const [anthropicTestPending, startAnthropicTest] = useTransition();

  function handleProviderChange(next: "anthropic" | "openai") {
    if (next === provider || providerPending) return;
    setProviderSaved(false);
    startProvider(async () => {
      const fd = new FormData();
      fd.append("provider", next);
      const res = await saveLLMProviderAction(fd);
      if (res.ok) {
        setProvider(next);
        setProviderSaved(true);
      }
    });
  }

  function handleSaveAnthropic(formData: FormData) {
    startAnthropicSave(async () => {
      const res = await saveUserApiKeyAction(formData);
      if (res.ok) {
        setAnthropicMasked(res.masked);
        setAnthropicTestResult(null);
      }
    });
  }

  function handleTestAnthropic() {
    startAnthropicTest(async () => {
      const result = await testUserApiKeyAction();
      setAnthropicTestResult(result);
    });
  }

  function handleSaveOpenAI(formData: FormData) {
    startSave(async () => {
      const res = await saveUserOpenAIKeyAction(formData);
      if (res.ok) {
        setOpenaiMasked(res.masked);
        setTestResult(null);
      }
    });
  }

  function handleTestOpenAI() {
    startTest(async () => {
      const result = await testUserOpenAIKeyAction();
      setTestResult(result);
    });
  }

  return (
    <div className="space-y-5">
      {/* Provider 선택 토글 */}
      <div>
        <Label className="mb-2 block">사용할 LLM</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleProviderChange("anthropic")}
            disabled={providerPending}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              provider === "anthropic"
                ? "bg-accent-600 text-white border-accent-600"
                : "bg-paper-50 text-ink-700 border-paper-300 hover:bg-paper-100"
            }`}
          >
            {providerPending && provider === "openai" ? (
              <Loader2 className="size-4 animate-spin inline mr-1.5" />
            ) : null}
            Claude (Anthropic)
          </button>
          <button
            type="button"
            onClick={() => handleProviderChange("openai")}
            disabled={providerPending}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              provider === "openai"
                ? "bg-accent-600 text-white border-accent-600"
                : "bg-paper-50 text-ink-700 border-paper-300 hover:bg-paper-100"
            }`}
          >
            {providerPending && provider === "anthropic" ? (
              <Loader2 className="size-4 animate-spin inline mr-1.5" />
            ) : null}
            ChatGPT (OpenAI)
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <p className="text-xs text-ink-500">
            {provider === "anthropic"
              ? "글 생성에 Claude (Anthropic)을 사용합니다."
              : "글 생성에 ChatGPT (OpenAI)를 사용합니다."}
          </p>
          {providerSaved && (
            <span className="text-xs text-green-600 font-medium">저장됨 ✓</span>
          )}
        </div>
      </div>

      {/* Anthropic 키 입력 (Claude 선택 시) */}
      {provider === "anthropic" && (
        <form action={handleSaveAnthropic} className="space-y-3 border-t border-paper-200 pt-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="anthropicKey">내 Claude API 키</Label>
              {anthropicMasked ? (
                <Badge tone="leaf">등록됨</Badge>
              ) : (
                <Badge tone="amber">미등록 — 글 생성 불가</Badge>
              )}
            </div>
            {anthropicMasked && (
              <p className="text-xs text-ink-500 font-mono">{anthropicMasked}</p>
            )}
            <div className="relative">
              <Input
                id="anthropicKey"
                name="apiKey"
                type={showAnthropicKey ? "text" : "password"}
                placeholder="sk-ant-..."
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
                tabIndex={-1}
                aria-label={showAnthropicKey ? "숨기기" : "보기"}
              >
                {showAnthropicKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-accent-600 underline underline-offset-4"
            >
              Anthropic API 키 발급받기 →
            </a>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button type="submit" size="sm" disabled={anthropicSavePending}>
              {anthropicSavePending && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={anthropicTestPending || anthropicSavePending}
              onClick={handleTestAnthropic}
            >
              {anthropicTestPending ? <Loader2 className="size-4 animate-spin" /> : null}
              연결 테스트
            </Button>
            {anthropicTestResult && (
              <Badge tone={anthropicTestResult.ok ? "leaf" : "amber"}>{anthropicTestResult.message}</Badge>
            )}
          </div>
        </form>
      )}

      {/* OpenAI 키 입력 (ChatGPT 선택 시) */}
      {provider === "openai" && (
        <form action={handleSaveOpenAI} className="space-y-3 border-t border-paper-200 pt-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="userOpenAIKey">내 OpenAI API 키</Label>
              {openaiMasked ? (
                <Badge tone="leaf">등록됨</Badge>
              ) : (
                <Badge tone="amber">미등록 — 글 생성 불가</Badge>
              )}
            </div>
            {openaiMasked && (
              <p className="text-xs text-ink-500 font-mono">{openaiMasked}</p>
            )}
            <div className="relative">
              <Input
                id="userOpenAIKey"
                name="apiKey"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
                tabIndex={-1}
                aria-label={showKey ? "숨기기" : "보기"}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-accent-600 underline underline-offset-4"
            >
              OpenAI API 키 발급받기 →
            </a>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button type="submit" size="sm" disabled={savePending}>
              {savePending && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testPending || savePending}
              onClick={handleTestOpenAI}
            >
              {testPending ? <Loader2 className="size-4 animate-spin" /> : null}
              연결 테스트
            </Button>
            {testResult && (
              <Badge tone={testResult.ok ? "leaf" : "amber"}>{testResult.message}</Badge>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
