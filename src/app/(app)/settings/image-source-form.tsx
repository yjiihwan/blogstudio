"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  describeOrder,
  SOURCE_LABEL,
  type AiSource,
  type ImageSource,
  type ImageSourceConfig,
  type StockSource,
} from "@/lib/image-source-config";
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
  saveImageSourceConfigAction,
  saveUserImageSourceConfigAction,
} from "./actions";

type TestResult = { ok: boolean; message: string } | null;

type KeySource = "unsplash" | "pexels" | "googleai";

interface SourceConfig {
  label: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  saveAction: (formData: FormData) => Promise<{ ok: true; masked: string } | { ok: false; error: string }>;
  testAction: () => Promise<{ ok: boolean; message: string }>;
}

const KEY_META: Record<KeySource, Omit<SourceConfig, "saveAction" | "testAction">> = {
  unsplash: {
    label: "Unsplash Access Key",
    placeholder: "your-unsplash-access-key",
    docsUrl: "https://unsplash.com/developers",
    docsLabel: "Unsplash 키 발급받기 →",
  },
  pexels: {
    label: "Pexels API Key",
    placeholder: "your-pexels-api-key",
    docsUrl: "https://www.pexels.com/api/",
    docsLabel: "Pexels 키 발급받기 →",
  },
  googleai: {
    label: "Google AI API Key",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    docsLabel: "Google AI Studio 키 발급받기 →",
  },
};

const SYSTEM_SOURCES: Record<KeySource, SourceConfig> = {
  unsplash: { ...KEY_META.unsplash, saveAction: saveUnsplashKeyAction, testAction: testUnsplashKeyAction },
  pexels: { ...KEY_META.pexels, saveAction: savePexelsKeyAction, testAction: testPexelsKeyAction },
  googleai: { ...KEY_META.googleai, saveAction: saveGoogleAiKeyAction, testAction: testGoogleAiKeyAction },
};

const USER_SOURCES: Record<KeySource, SourceConfig> = {
  unsplash: { ...KEY_META.unsplash, saveAction: saveUserUnsplashKeyAction, testAction: testUserUnsplashKeyAction },
  pexels: { ...KEY_META.pexels, saveAction: saveUserPexelsKeyAction, testAction: testUserPexelsKeyAction },
  googleai: { ...KEY_META.googleai, saveAction: saveUserGoogleAiKeyAction, testAction: testUserGoogleAiKeyAction },
};

function KeyForm({
  source,
  initialMasked,
  config,
  idPrefix,
}: {
  source: KeySource;
  initialMasked: string | null;
  config: SourceConfig;
  idPrefix: string;
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

  const inputId = `${idPrefix}-apiKey-${source}`;
  return (
    <form action={handleSave} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{config.label}</Label>
        {masked && <p className="text-xs text-ink-500 font-mono">{masked}</p>}
        <div className="relative">
          <Input
            id={inputId}
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
        <Button type="button" variant="outline" size="sm" disabled={testPending || savePending} onClick={handleTest}>
          {testPending && <Loader2 className="size-4 animate-spin" />}
          연결 테스트
        </Button>
        {testResult && <Badge tone={testResult.ok ? "leaf" : "amber"}>{testResult.message}</Badge>}
        {saveMsg && (
          <span className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-red-600"}`}>{saveMsg.text}</span>
        )}
      </div>
    </form>
  );
}

// ── 사용여부 · 시도 순서 · 자동 검증 패널 ───────────────────────────────────

type KeyPresence = Record<ImageSource, boolean>;

const SOURCE_SUB: Record<ImageSource, string> = {
  unsplash: "무료 고품질 스톡",
  pexels: "무료 스톡",
  google_ai: "imagen-3.0 · 유료 티어 전용",
  openai_image: "글 생성용 OpenAI 키 공용",
};

function moveInOrder<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function SourceConfigPanel({
  initial,
  keyPresence,
  saveAction,
  idPrefix,
  onChange,
}: {
  initial: ImageSourceConfig;
  keyPresence: KeyPresence;
  saveAction: (raw: unknown) => Promise<{ ok: true; config: ImageSourceConfig } | { ok: false; error: string }>;
  idPrefix: string;
  onChange?: (cfg: ImageSourceConfig) => void;
}) {
  const [cfg, setCfg] = useState<ImageSourceConfig>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startSave] = useTransition();

  function commit(next: ImageSourceConfig) {
    setCfg(next);
    onChange?.(next);
    setMsg(null);
    startSave(async () => {
      try {
        const r = await saveAction(next);
        if (r.ok) {
          setCfg(r.config);
          onChange?.(r.config);
          setMsg({ ok: true, text: "저장됨 ✓" });
        } else {
          setMsg({ ok: false, text: r.error });
        }
      } catch {
        setMsg({ ok: false, text: "저장 중 오류가 발생했습니다." });
      }
    });
  }

  const order = describeOrder(cfg);

  function renderGroup<T extends ImageSource>(title: string, hint: string, group: "stock" | "ai", list: T[]) {
    return (
      <div>
        <p className="text-xs font-semibold text-ink-700 mb-1.5">
          {title} <span className="text-ink-400 font-normal">· {hint}</span>
        </p>
        <ul className="rounded-lg border border-paper-300 divide-y divide-paper-200 bg-white">
          {list.map((s, i) => {
            const on = cfg.enabled[s];
            const hasKey = keyPresence[s];
            return (
              <li key={s} className={cn("flex items-center gap-2 px-3 py-2", !on && "opacity-50")}>
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`${SOURCE_LABEL[s]} 위로`}
                    disabled={pending || i === 0}
                    onClick={() => {
                      const next = moveInOrder(list, i, -1);
                      commit({ ...cfg, order: { ...cfg.order, [group]: next } as ImageSourceConfig["order"] });
                    }}
                    className="text-ink-400 hover:text-ink-800 disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${SOURCE_LABEL[s]} 아래로`}
                    disabled={pending || i === list.length - 1}
                    onClick={() => {
                      const next = moveInOrder(list, i, 1);
                      commit({ ...cfg, order: { ...cfg.order, [group]: next } as ImageSourceConfig["order"] });
                    }}
                    className="text-ink-400 hover:text-ink-800 disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <span className="text-xs font-bold text-ink-400 w-4">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{SOURCE_LABEL[s]}</p>
                  <p className="text-[11px] text-ink-500">
                    {SOURCE_SUB[s]}
                    {on && !hasKey && <span className="text-amber-600"> · 키 없음 → 켜도 동작하지 않습니다</span>}
                  </p>
                </div>
                <Badge tone={hasKey ? "leaf" : "neutral"} className="hidden sm:inline-flex">{hasKey ? "키 있음" : "키 없음"}</Badge>
                <Label htmlFor={`${idPrefix}-use-${s}`} className="text-[11px] text-ink-500 hidden sm:inline">
                  사용
                </Label>
                <Switch
                  id={`${idPrefix}-use-${s}`}
                  checked={on}
                  disabled={pending}
                  onCheckedChange={(v) => commit({ ...cfg, enabled: { ...cfg.enabled, [s]: v } })}
                />
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-paper-100 px-4 py-3 space-y-4">
      <div>
        <p className="text-sm font-semibold mb-1">사용 여부 · 시도 순서</p>
        <p className="text-xs text-ink-600 leading-relaxed" data-testid={`${idPrefix}-order-summary`}>
          현재 시도 순서 — <strong>스톡:</strong> {order.stock} · <strong>AI:</strong> {order.ai}
          <br />
          <span className="text-ink-500">켜진 소스만 위 순서로 시도하고 첫 성공 결과를 사용합니다. 같은 소스를 재시도하지는 않습니다.</span>
        </p>
      </div>

      {renderGroup("스톡 검색", "검색 상위 5장 중 합격작 채택", "stock", cfg.order.stock as StockSource[])}
      {renderGroup("AI 생성", "생성 → 심사 → 불합격 시 1회 재생성", "ai", cfg.order.ai as AiSource[])}

      <div className="border-t border-paper-300 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">이미지 자동 검증</p>
            <p className="text-[11px] text-ink-500 leading-relaxed">
              후보 이미지를 OpenAI 비전 모델로 심사(묘사 일치 0~10 · 품질 0~10)해 기준을 넘는 첫 장을 채택합니다.
              끄면 종전처럼 첫 결과를 즉시 채택합니다. OpenAI 키가 없거나 심사 오류면 자동으로 건너뜁니다(요청당 최대 8회).
            </p>
          </div>
          <Switch
            id={`${idPrefix}-verify`}
            aria-label="이미지 자동 검증"
            checked={cfg.verify.enabled}
            disabled={pending}
            onCheckedChange={(v) => commit({ ...cfg, verify: { ...cfg.verify, enabled: v } })}
          />
        </div>
        <div className={cn("mt-2 flex items-center gap-4 flex-wrap", !cfg.verify.enabled && "opacity-50")}>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            일치 기준 ≥
            <Input
              type="number"
              min={0}
              max={10}
              value={cfg.verify.minMatch}
              disabled={pending || !cfg.verify.enabled}
              onChange={(e) => setCfg({ ...cfg, verify: { ...cfg.verify, minMatch: Number(e.target.value) } })}
              onBlur={(e) => commit({ ...cfg, verify: { ...cfg.verify, minMatch: Number(e.target.value) } })}
              className="w-16 h-8 text-xs"
              aria-label="일치 기준"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            품질 기준 ≥
            <Input
              type="number"
              min={0}
              max={10}
              value={cfg.verify.minQuality}
              disabled={pending || !cfg.verify.enabled}
              onChange={(e) => setCfg({ ...cfg, verify: { ...cfg.verify, minQuality: Number(e.target.value) } })}
              onBlur={(e) => commit({ ...cfg, verify: { ...cfg.verify, minQuality: Number(e.target.value) } })}
              className="w-16 h-8 text-xs"
              aria-label="품질 기준"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs min-h-4">
        {pending && <Loader2 className="size-3.5 animate-spin text-ink-400" />}
        {msg && <span className={msg.ok ? "text-green-600" : "text-red-600"}>{msg.text}</span>}
      </div>
    </div>
  );
}

// ── 키 입력 섹션 공통 ─────────────────────────────────────────────────────────

function SourceSections({
  sources,
  unsplashMasked,
  pexelsMasked,
  googleAiMasked,
  openaiKeyPresent,
  cfg,
  idPrefix,
}: {
  sources: Record<KeySource, SourceConfig>;
  unsplashMasked: string | null;
  pexelsMasked: string | null;
  googleAiMasked: string | null;
  openaiKeyPresent: boolean;
  cfg: ImageSourceConfig;
  idPrefix: string;
}) {
  return (
    <>
      {/* Unsplash */}
      <div className={cn(!cfg.enabled.unsplash && "opacity-50")}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Unsplash <span className="text-ink-500 font-normal">· 무료 고품질 스톡</span>
          </p>
          <Badge tone={unsplashMasked ? "leaf" : "neutral"}>{unsplashMasked ? "연결됨" : "미연결"}</Badge>
        </div>
        <KeyForm source="unsplash" initialMasked={unsplashMasked} config={sources.unsplash} idPrefix={idPrefix} />
      </div>

      <div className="border-t border-paper-300" />

      {/* Pexels */}
      <div className={cn(!cfg.enabled.pexels && "opacity-50")}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Pexels <span className="text-ink-500 font-normal">· 무료 스톡</span>
          </p>
          <Badge tone={pexelsMasked ? "leaf" : "neutral"}>{pexelsMasked ? "연결됨" : "미연결"}</Badge>
        </div>
        <KeyForm source="pexels" initialMasked={pexelsMasked} config={sources.pexels} idPrefix={idPrefix} />
      </div>

      <div className="border-t border-paper-300" />

      {/* OpenAI gpt-image-1 — 키 입력란 없음(글 생성용 OpenAI 키 공용) */}
      <div className={cn("rounded-lg bg-paper-100 px-4 py-3", !cfg.enabled.openai_image && "opacity-50")}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            AI 이미지 생성 <span className="text-ink-500 font-normal">· OpenAI gpt-image-1</span>
          </p>
          <Badge tone={openaiKeyPresent ? "leaf" : "neutral"}>{openaiKeyPresent ? "OpenAI 키 사용" : "OpenAI 키 없음"}</Badge>
        </div>
        <p className="text-xs text-ink-500">
          사진 요청에서 <strong>AI 생성 / 스톡→AI</strong>를 고르면 이미지를 생성합니다. 별도 키 등록은 필요 없고
          <strong> AI 글쓰기 설정의 OpenAI 키를 그대로 공용</strong>으로 씁니다. 사용 여부는 위 «AI 생성» 목록의 스위치로 끄고 켭니다.
        </p>
      </div>

      {/* Google Imagen — 고급(선택), 현재 미작동 */}
      <div className={cn(!cfg.enabled.google_ai && "opacity-50")}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Google Imagen <span className="text-ink-500 font-normal">· 고급(선택) · 텍스트→이미지</span>
          </p>
          <Badge tone={googleAiMasked ? "amber" : "neutral"}>{googleAiMasked ? "키 등록됨 · 현재 미작동" : "미사용"}</Badge>
        </div>
        <p className="text-xs text-ink-500 mb-3">
          <code className="text-[11px]">imagen-3.0-generate-002</code>는 Google 유료 티어 전용입니다. 일반 키로는 접근 불가(404)라
          AI 생성은 다음 순서의 소스(OpenAI gpt-image-1)로 넘어갑니다. 등록해두면 추후 사용 가능 시 순서대로 적용됩니다.
        </p>
        <KeyForm source="googleai" initialMasked={googleAiMasked} config={sources.googleai} idPrefix={idPrefix} />
      </div>
    </>
  );
}

// ── 공개 컴포넌트 ────────────────────────────────────────────────────────────

type FormProps = {
  unsplashMasked: string | null;
  pexelsMasked: string | null;
  googleAiMasked: string | null;
  /** gpt-image-1·심사에 쓸 OpenAI 키 존재 여부 */
  openaiKeyPresent: boolean;
  config: ImageSourceConfig;
};

export function ImageSourceForm(props: FormProps) {
  const [cfg, setCfg] = useState(props.config);
  const keyPresence: KeyPresence = {
    unsplash: !!props.unsplashMasked,
    pexels: !!props.pexelsMasked,
    google_ai: !!props.googleAiMasked,
    openai_image: props.openaiKeyPresent,
  };
  return (
    <div className="space-y-6">
      <SourceConfigPanel
        initial={props.config}
        keyPresence={keyPresence}
        saveAction={saveImageSourceConfigAction}
        idPrefix="sys"
        onChange={setCfg}
      />
      <SourceSections sources={SYSTEM_SOURCES} {...props} cfg={cfg} idPrefix="sys" />

      <div className="border-t border-paper-300" />

      {/* Adobe Firefly — 준비 중 */}
      <div className="opacity-60">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">
            Adobe Firefly <span className="text-ink-500 font-normal">· 텍스트→이미지 생성</span>
          </p>
          <Badge tone="neutral">별도 연동 준비 중</Badge>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">Adobe Firefly API 연동은 현재 준비 중입니다. 추후 업데이트 예정입니다.</p>
      </div>
    </div>
  );
}

export function UserImageSourceForm(props: FormProps) {
  const [cfg, setCfg] = useState(props.config);
  const keyPresence: KeyPresence = {
    unsplash: !!props.unsplashMasked,
    pexels: !!props.pexelsMasked,
    google_ai: !!props.googleAiMasked,
    openai_image: props.openaiKeyPresent,
  };
  return (
    <div className="space-y-6">
      <SourceConfigPanel
        initial={props.config}
        keyPresence={keyPresence}
        saveAction={saveUserImageSourceConfigAction}
        idPrefix="user"
        onChange={setCfg}
      />
      <SourceSections sources={USER_SOURCES} {...props} cfg={cfg} idPrefix="user" />
    </div>
  );
}
