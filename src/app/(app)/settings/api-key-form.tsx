"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveApiKeyAction, testApiKeyAction } from "./actions";

type TestResult = { ok: boolean; message: string } | null;

export function ApiKeyForm({ initialMasked }: { initialMasked: string | null }) {
  const [showKey, setShowKey] = useState(false);
  const [masked, setMasked] = useState(initialMasked);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();

  function handleSave(formData: FormData) {
    setSaveMsg(null);
    startSave(async () => {
      try {
        const result = await saveApiKeyAction(formData);
        if (result.ok) {
          setMasked(result.masked);
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
      const result = await testApiKeyAction();
      setTestResult(result);
    });
  }

  return (
    <form action={handleSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="apiKey">API 키</Label>
        {masked && (
          <p className="text-xs text-ink-500 font-mono mt-1">{masked}</p>
        )}
        <div className="relative">
          <Input
            id="apiKey"
            name="apiKey"
            type={showKey ? "text" : "password"}
            placeholder="sk-ant-api03-..."
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
            {showKey ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent-600 underline underline-offset-4"
        >
          API 키 발급받기 →
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
          {testPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          연결 테스트
        </Button>
        {testResult && (
          <Badge tone={testResult.ok ? "leaf" : "amber"}>
            {testResult.message}
          </Badge>
        )}
        {saveMsg && (
          <span className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {saveMsg.text}
          </span>
        )}
      </div>
    </form>
  );
}
