"use client";

import { useActionState, useRef } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadPhotoAction, skipPhotoAction } from "./actions";

export function PhotoUploadForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(uploadPhotoAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  if (state?.success) {
    return (
      <div className="mt-4 rounded-lg bg-green-50 border border-green-200 py-6 flex flex-col items-center gap-2">
        <CheckCircle2 className="size-8 text-green-500" />
        <p className="text-sm font-semibold text-green-700">업로드 완료!</p>
      </div>
    );
  }

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="requestId" value={requestId} />
        <label className="mt-4 block rounded-lg border-2 border-dashed border-paper-300 px-4 py-6 text-center cursor-pointer hover:border-accent-400 hover:bg-accent-50/50 transition">
          {pending ? (
            <>
              <div className="size-5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin mx-auto mb-1.5" />
              <div className="text-xs font-semibold text-ink-700">
                업로드 중...
              </div>
            </>
          ) : (
            <>
              <Camera className="size-5 text-ink-400 mx-auto mb-1.5" />
              <div className="text-xs font-semibold text-ink-700">
                사진 촬영·업로드
              </div>
              <div className="text-[10px] text-ink-400 mt-0.5">
                JPG / PNG / HEIC, 최대 10MB
              </div>
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
          <p className="text-xs text-red-500 mt-1.5 text-center">
            {state.error}
          </p>
        )}
      </form>
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
        사진 없이 진행 (자동 이미지로 대체)
      </Button>
    </form>
  );
}
