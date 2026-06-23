"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2, Loader2, Sparkles, ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadPhotoAction, skipPhotoAction, autoSourcePhotoAction } from "./actions";

type AutoMode = "stock" | "ai" | "stock_then_ai";
const MODE_LABEL: Record<AutoMode, string> = {
  stock: "스톡 검색",
  ai: "AI 생성",
  stock_then_ai: "스톡→AI",
};

export function PhotoUploadForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(uploadPhotoAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // 자동 소싱 상태
  const [autoUrl, setAutoUrl] = useState<string | null>(null);
  const [autoProvider, setAutoProvider] = useState<string | null>(null);
  const [autoErr, setAutoErr] = useState<string | null>(null);
  const [autoPending, startAuto] = useTransition();
  const [busyMode, setBusyMode] = useState<AutoMode | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);

  function runAuto(mode: AutoMode, fb?: string) {
    setAutoErr(null);
    setBusyMode(mode);
    startAuto(async () => {
      const res = await autoSourcePhotoAction(requestId, mode, fb);
      setBusyMode(null);
      if (res.ok && res.imageUrl) {
        setAutoUrl(res.imageUrl + `?t=${Date.now()}`);
        setAutoProvider(res.provider ?? null);
        setShowFeedback(false);
        setFeedback("");
      } else {
        setAutoErr(res.error ?? "실패했습니다.");
      }
    });
  }

  if (state?.success || done) {
    return (
      <div className="mt-4 rounded-lg bg-green-50 border border-green-200 py-6 flex flex-col items-center gap-2">
        <CheckCircle2 className="size-8 text-green-500" />
        <p className="text-sm font-semibold text-green-700">이미지 적용 완료!</p>
      </div>
    );
  }

  // 자동 소싱 결과가 있으면: 미리보기 + 반려(피드백)/재생성/확정
  if (autoUrl) {
    return (
      <div className="mt-4 space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={autoUrl}
          alt="자동 생성 이미지"
          className="w-full h-44 object-cover rounded-lg border border-paper-300"
        />
        <p className="text-[11px] text-ink-400 text-center">
          {autoProvider ? `출처: ${autoProvider}` : ""}
          {feedback ? "" : ""}
        </p>

        {autoErr && <p className="text-xs text-red-500 text-center">{autoErr}</p>}

        {!showFeedback ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="flex-1"
              onClick={() => setDone(true)}
            >
              이 이미지로 확정
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowFeedback(true)}
            >
              <RefreshCw className="size-3.5" />
              반려하고 다시
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-paper-300 bg-paper-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-ink-700">
              어떻게 바꿀까요? (피드백을 반영해 다시 만듭니다)
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              placeholder="예: 사람 없이 시설만, 더 밝은 분위기로, 실내 위주로"
              className="w-full rounded-md border border-paper-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent-400"
            />
            <div className="flex flex-wrap gap-1.5">
              {(["stock", "ai", "stock_then_ai"] as AutoMode[]).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={autoPending}
                  onClick={() => runAuto(m, feedback)}
                >
                  {autoPending && busyMode === m ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {MODE_LABEL[m]}로 다시
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={autoPending}
                onClick={() => setShowFeedback(false)}
              >
                취소
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 기본: 직접 업로드 + 자동 소싱 3택 + 건너뛰기
  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="requestId" value={requestId} />
        <label className="mt-4 block rounded-lg border-2 border-dashed border-paper-300 px-4 py-5 text-center cursor-pointer hover:border-accent-400 hover:bg-accent-50/50 transition">
          {pending ? (
            <>
              <div className="size-5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin mx-auto mb-1.5" />
              <div className="text-xs font-semibold text-ink-700">업로드 중...</div>
            </>
          ) : (
            <>
              <Camera className="size-5 text-ink-400 mx-auto mb-1.5" />
              <div className="text-xs font-semibold text-ink-700">사진 촬영·직접 업로드</div>
              <div className="text-[10px] text-ink-400 mt-0.5">JPG / PNG / HEIC, 최대 10MB</div>
            </>
          )}
          <input
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={pending}
            onChange={() => formRef.current?.requestSubmit()}
          />
        </label>
        {state?.error && (
          <p className="text-xs text-red-500 mt-1.5 text-center">{state.error}</p>
        )}
      </form>

      {/* 자동 이미지 소싱 */}
      <div className="mt-2 rounded-lg border border-paper-200 bg-paper-50 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-600 mb-1.5">
          <ImageIcon className="size-3.5" />
          자동 이미지로 채우기
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["stock", "ai", "stock_then_ai"] as AutoMode[]).map((m) => (
            <Button
              key={m}
              type="button"
              variant="secondary"
              size="sm"
              disabled={autoPending}
              onClick={() => runAuto(m)}
            >
              {autoPending && busyMode === m ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {MODE_LABEL[m]}
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-ink-400 mt-1.5">
          스톡=Unsplash/Pexels 검색 · AI=이미지 생성 · 스톡→AI=스톡 먼저, 없으면 AI
        </p>
        {autoErr && <p className="text-xs text-red-500 mt-1.5">{autoErr}</p>}
      </div>

      <SkipForm requestId={requestId} />
    </>
  );
}

function SkipForm({ requestId }: { requestId: string }) {
  const [, formAction, pending] = useActionState(skipPhotoAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-ink-400"
        disabled={pending}
      >
        이미지 없이 건너뛰기
      </Button>
    </form>
  );
}
