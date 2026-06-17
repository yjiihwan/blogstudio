"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  saveLLMProviderAction,
  saveApiKeyAction,
  testApiKeyAction,
  saveSystemOpenAIKeyAction,
  testSystemOpenAIKeyAction,
} from "./actions";

type TestResult = { ok: boolean; message: string } | null;
type SaveMsg = { ok: boolean; text: string } | null;

/**
 * Admin LLM 설정 — admin은 곧 시스템이므로 "개인 키" 개념이 없다.
 * provider(Claude/ChatGPT) 양자택일 + 선택한 provider의 시스템 키 입력 1개.
 * 키는 전역 settings 테이블에 저장되어 시스템 키 모드 계정들이 공유한다.
 */
export function SystemLLMForm({
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
  const [showKey, setShowKey] = useState(false);
  const [providerPending, startProvider] = useTransition();
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [saveMsg, setSaveMsg] = useState<SaveMsg>(null);

  function handleProviderChange(next: "anthropic" | "openai") {
    if (next === provider || providerPending) return;
    setProviderSaved(false);
    setProviderError(null);
    setTestResult(null);
    setSaveMsg(null);
    startProvider(async () => {
      try {
        const fd = new FormData();
        fd.append("provider", next);
        const res = await saveLLMProviderAction(fd);
        if (res.ok) {
          setProvider(next);
          setProviderSaved(true);
        } else {
          setProviderError(res.error ?? "전환에 실패했습니다.");
        }
      } catch {
        setProviderError("전환 중 오류가 발생했습니다.");
      }
    });
  }

  function handleSave(formData: FormData) {
    setSaveMsg(null);
    setTestResult(null);
    startSave(async () => {
      try {
        const res =
          provider === "anthropic"
            ? await saveApiKeyAction(formData)
            : await saveSystemOpenAIKeyAction(formData);
        if (res.ok) {
          if (provider === "anthropic") setAnthropicMasked(res.masked);
          else setOpenaiMasked(res.masked);
          setSaveMsg({ ok: true, text: "저장됨 ✓" });
        } else {
          setSaveMsg({ ok: false, text: res.error });
        }
      } catch {
        setSaveMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
      }
    });
  }

  function handleTest() {
    startTest(async () => {
      const result =
        provider === "anthropic"
          ? await testApiKeyAction()
          : await testSystemOpenAIKeyAction();
      setTestResult(result);
    });
  }

  const isAnthropic = provider === "anthropic";
  const masked = isAnthropic ? anthropicMasked : openaiMasked;
  const label = isAnthropic ? "Claude (Anthropic)" : "ChatGPT (OpenAI)";
  const keyLabel = isAnthropic ? "Anthropic API 키" : "OpenAI API 키";
  const placeholder = isAnthropic ? "sk-ant-..." : "sk-...";
  const issueUrl = isAnthropic
    ? "https://console.anthropic.com/settings/keys"
    : "https://platform.openai.com/api-keys";

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
              isAnthropic
                ? "bg-accent-600 text-white border-accent-600"
                : "bg-paper-50 text-ink-700 border-paper-300 hover:bg-paper-100"
            }`}
          >
            {providerPending && !isAnthropic ? (
              <Loader2 className="size-4 animate-spin inline mr-1.5" />
            ) : null}
            Claude (Anthropic)
          </button>
          <button
            type="button"
            onClick={() => handleProviderChange("openai")}
            disabled={providerPending}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              !isAnthropic
                ? "bg-accent-600 text-white border-accent-600"
                : "bg-paper-50 text-ink-700 border-paper-300 hover:bg-paper-100"
            }`}
          >
            {providerPending && isAnthropic ? (
              <Loader2 className="size-4 animate-spin inline mr-1.5" />
            ) : null}
            ChatGPT (OpenAI)
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <p className="text-xs text-ink-500">
            글 생성에 {label}을(를) 사용합니다. 시스템 키 모드 계정이 함께 사용합니다.
          </p>
          {providerSaved && (
            <span className="text-xs text-green-600 font-medium">저장됨 ✓</span>
          )}
          {providerError && (
            <span className="text-xs text-red-600 font-medium">{providerError}</span>
          )}
        </div>
      </div>

      {/* 선택한 provider의 시스템 키 입력 (1개만) */}
      <form action={handleSave} className="space-y-3 border-t border-paper-200 pt-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="systemKey">{keyLabel}</Label>
            {masked ? (
              <Badge tone="leaf">등록됨</Badge>
            ) : (
              <Badge tone="amber">미등록 — 글 생성 불가</Badge>
            )}
          </div>
          {masked && <p className="text-xs text-ink-500 font-mono">{masked}</p>}
          <div className="relative">
            <Input
              id="systemKey"
              name="apiKey"
              type={showKey ? "text" : "password"}
              placeholder={placeholder}
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
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-accent-600 underline underline-offset-4"
          >
            {keyLabel} 발급받기 →
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
            onClick={handleTest}
          >
            {testPending ? <Loader2 className="size-4 animate-spin" /> : null}
            연결 테스트
          </Button>
          {testResult && (
            <Badge tone={testResult.ok ? "leaf" : "amber"}>{testResult.message}</Badge>
          )}
          {saveMsg && (
            <span className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
