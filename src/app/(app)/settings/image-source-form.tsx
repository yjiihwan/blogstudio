"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  saveUnsplashKeyAction,
  testUnsplashKeyAction,
  savePexelsKeyAction,
  testPexelsKeyAction,
  saveGoogleAiKeyAction,
  testGoogleAiKeyAction,
  saveUserUnsplashKeyAction,
  testUserUnsplashKeyAction,
  saveUserPexelsKeyAction,
  testUserPexelsKeyAction,
  saveUserGoogleAiKeyAction,
  testUserGoogleAiKeyAction,
} from "./actions";

type TestResult = { ok: boolean; message: string } | null;

type Source = "unsplash" | "pexels" | "googleai";

interface SourceConfig {
  label: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  saveAction: (formData: FormData) => Promise<{ ok: true; masked: string } | { ok: false; error: string }>;
  testAction: () => Promise<{ ok: boolean; message: string }>;
}

const SOURCES: Record<Source, SourceConfig> = {
  unsplash: {
    label: "Unsplash Access Key",
    placeholder: "your-unsplash-access-key",
    docsUrl: "https://unsplash.com/developers",
    docsLabel: "Unsplash 키 발급받기 →",
    saveAction: saveUnsplashKeyAction,
    testAction: testUnsplashKeyAction,
  },
  pexels: {
    label: "Pexels API Key",
    placeholder: "your-pexels-api-key",
    docsUrl: "https://www.pexels.com/api/",
    docsLabel: "Pexels 키 발급받기 →",
    saveAction: savePexelsKeyAction,
    testAction: testPexelsKeyAction,
  },
  googleai: {
    label: "Google AI API Key",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    docsLabel: "Google AI Studio 키 발급받기 →",
    saveAction: saveGoogleAiKeyAction,
    testAction: testGoogleAiKeyAction,
  },
};

function KeyForm({
  source,
  initialMasked,
}: {
  source: Source;
  initialMasked: string | null;
}) {
  const config = SOURCES[source];
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
        const result = await config.saveAction(formData);
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
      const result = await config.testAction();
      setTestResult(result);
    });
  }

  return (
    <form action={handleSave} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`apiKey-${source}`}>{config.label}</Label>
        {masked && (
          <p className="text-xs text-ink-500 font-mono">{masked}</p>
        )}
        <div className="relative">
          <Input
            id={`apiKey-${source}`}
            name="apiKey"
            type={showKey ? "text" : "password"}
            placeholder={config.placeholder}
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
          href={config.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-accent-600 underline underline-offset-4"
        >
          {config.docsLabel}
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
          {testPending && <Loader2 className="size-4 animate-spin" />}
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

const USER_SOURCES: Record<Source, SourceConfig> = {
  unsplash: {
    label: "Unsplash Access Key",
    placeholder: "your-unsplash-access-key",
    docsUrl: "https://unsplash.com/developers",
    docsLabel: "Unsplash 키 발급받기 →",
    saveAction: saveUserUnsplashKeyAction,
    testAction: testUserUnsplashKeyAction,
  },
  pexels: {
    label: "Pexels API Key",
    placeholder: "your-pexels-api-key",
    docsUrl: "https://www.pexels.com/api/",
    docsLabel: "Pexels 키 발급받기 →",
    saveAction: saveUserPexelsKeyAction,
    testAction: testUserPexelsKeyAction,
  },
  googleai: {
    label: "Google AI API Key",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    docsLabel: "Google AI Studio 키 발급받기 →",
    saveAction: saveUserGoogleAiKeyAction,
    testAction: testUserGoogleAiKeyAction,
  },
};

export function UserImageSourceForm({
  unsplashMasked,
  pexelsMasked,
  googleAiMasked,
}: {
  unsplashMasked: string | null;
  pexelsMasked: string | null;
  googleAiMasked: string | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Unsplash <span className="text-ink-500 font-normal">· 무료 고품질 스톡</span>
          </p>
          <Badge tone={unsplashMasked ? "leaf" : "neutral"}>
            {unsplashMasked ? "연결됨" : "미연결"}
          </Badge>
        </div>
        <KeyFormWithConfig source="unsplash" initialMasked={unsplashMasked} config={USER_SOURCES.unsplash} />
      </div>

      <div className="border-t border-paper-300" />

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Pexels <span className="text-ink-500 font-normal">· 무료 스톡</span>
          </p>
          <Badge tone={pexelsMasked ? "leaf" : "neutral"}>
            {pexelsMasked ? "연결됨" : "미연결"}
          </Badge>
        </div>
        <KeyFormWithConfig source="pexels" initialMasked={pexelsMasked} config={USER_SOURCES.pexels} />
      </div>

      <div className="border-t border-paper-300" />

      {/* AI 이미지 생성 — 실제 엔진은 OpenAI gpt-image-1 */}
      <div className="rounded-lg bg-paper-100 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            AI 이미지 생성 <span className="text-ink-500 font-normal">· OpenAI gpt-image-1</span>
          </p>
          <Badge tone="leaf">OpenAI 키 사용</Badge>
        </div>
        <p className="text-xs text-ink-500">
          사진 요청에서 <strong>AI 생성 / 스톡→AI</strong>를 고르면 이미지를 생성합니다.
          별도 키 등록은 필요 없고, 위 <strong>AI 글쓰기 설정의 OpenAI 키</strong>를 그대로 사용합니다.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Google Imagen{" "}
            <span className="text-ink-500 font-normal">· 고급(선택) · 텍스트→이미지</span>
          </p>
          <Badge tone={googleAiMasked ? "amber" : "neutral"}>
            {googleAiMasked ? "키 등록됨 · 현재 미작동" : "미사용"}
          </Badge>
        </div>
        <p className="text-xs text-ink-500 mb-3">
          모델 <code className="text-[11px]">imagen-3.0-generate-002</code>는 Google 유료 티어에서만 동작합니다.
          현재 일반 Google AI Studio 키로는 접근이 안 돼(404), AI 생성은 OpenAI로 처리됩니다.
          키를 등록해두면 추후 imagen 사용이 가능해질 때 자동으로 우선 사용합니다.
        </p>
        <KeyFormWithConfig source="googleai" initialMasked={googleAiMasked} config={USER_SOURCES.googleai} />
      </div>
    </div>
  );
}

function KeyFormWithConfig({
  source,
  initialMasked,
  config,
}: {
  source: Source;
  initialMasked: string | null;
  config: SourceConfig;
}) {
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
        const result = await config.saveAction(formData);
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
      const result = await config.testAction();
      setTestResult(result);
    });
  }

  return (
    <form action={handleSave} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`user-apiKey-${source}`}>{config.label}</Label>
        {masked && <p className="text-xs text-ink-500 font-mono">{masked}</p>}
        <div className="relative">
          <Input
            id={`user-apiKey-${source}`}
            name="apiKey"
            type={showKey ? "text" : "password"}
            placeholder={config.placeholder}
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
        <a href={config.docsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-block text-xs text-accent-600 underline underline-offset-4">
          {config.docsLabel}
        </a>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" size="sm" disabled={savePending}>
          {savePending && <Loader2 className="size-4 animate-spin" />}저장
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={testPending || savePending} onClick={handleTest}>
          {testPending && <Loader2 className="size-4 animate-spin" />}연결 테스트
        </Button>
        {testResult && <Badge tone={testResult.ok ? "leaf" : "amber"}>{testResult.message}</Badge>}
        {saveMsg && (
          <span className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {saveMsg.text}
          </span>
        )}
      </div>
    </form>
  );
}

export function ImageSourceForm({
  unsplashMasked,
  pexelsMasked,
  googleAiMasked,
}: {
  unsplashMasked: string | null;
  pexelsMasked: string | null;
  googleAiMasked: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Unsplash */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Unsplash{" "}
            <span className="text-ink-500 font-normal">· 무료 고품질 스톡</span>
          </p>
          <Badge tone={unsplashMasked ? "leaf" : "neutral"}>
            {unsplashMasked ? "연결됨" : "미연결"}
          </Badge>
        </div>
        <KeyForm source="unsplash" initialMasked={unsplashMasked} />
      </div>

      <div className="border-t border-paper-300" />

      {/* Pexels */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Pexels{" "}
            <span className="text-ink-500 font-normal">· 무료 스톡</span>
          </p>
          <Badge tone={pexelsMasked ? "leaf" : "neutral"}>
            {pexelsMasked ? "연결됨" : "미연결"}
          </Badge>
        </div>
        <KeyForm source="pexels" initialMasked={pexelsMasked} />
      </div>

      <div className="border-t border-paper-300" />

      {/* AI 이미지 생성 — OpenAI gpt-image-1 */}
      <div className="rounded-lg bg-paper-100 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            AI 이미지 생성 <span className="text-ink-500 font-normal">· OpenAI gpt-image-1</span>
          </p>
          <Badge tone="leaf">OpenAI 키 사용</Badge>
        </div>
        <p className="text-xs text-ink-500">
          사진 요청에서 <strong>AI 생성 / 스톡→AI</strong> 선택 시 이미지를 생성합니다.
          별도 키 없이 OpenAI 키를 그대로 사용합니다.
        </p>
      </div>

      {/* Google Imagen — 고급(선택), 현재 미작동 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Google Imagen{" "}
            <span className="text-ink-500 font-normal">· 고급(선택) · 텍스트→이미지</span>
          </p>
          <Badge tone={googleAiMasked ? "amber" : "neutral"}>
            {googleAiMasked ? "키 등록됨 · 현재 미작동" : "미사용"}
          </Badge>
        </div>
        <p className="text-xs text-ink-500 mb-3">
          <code className="text-[11px]">imagen-3.0-generate-002</code>는 Google 유료 티어 전용입니다.
          일반 키로는 접근 불가(404)라 AI 생성은 OpenAI로 처리됩니다. 등록해두면 추후 사용 가능 시 우선 적용됩니다.
        </p>
        <KeyForm source="googleai" initialMasked={googleAiMasked} />
      </div>

      <div className="border-t border-paper-300" />

      {/* Adobe Firefly — 준비 중 */}
      <div className="opacity-60">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Adobe Firefly{" "}
            <span className="text-ink-500 font-normal">· 텍스트→이미지 생성</span>
          </p>
          <Badge tone="neutral">별도 연동 준비 중</Badge>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">
          Adobe Firefly API 연동은 현재 준비 중입니다. 추후 업데이트 예정입니다.
        </p>
      </div>
    </div>
  );
}
