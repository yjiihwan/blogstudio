"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import {
  generateNewDraftActionState,
  GenerateDraftState,
} from "../[id]/actions";

export function GenerateDraftButton({ blogId }: { blogId: string }) {
  const [state, action, pending] = useActionState<GenerateDraftState, FormData>(
    generateNewDraftActionState,
    null
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="blogId" value={blogId} />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {pending ? "생성 중..." : "초안 생성"}
      </Button>
      {pending && (
        <p className="text-xs text-ink-500 text-right">약 15~40초 소요</p>
      )}
      {state && "error" in state && (
        <p className="text-xs text-destructive max-w-sm text-right">
          {state.error}
        </p>
      )}
      {state && "needsInfo" in state && (
        <div className="mt-2 w-full max-w-md rounded-lg border border-accent-300 bg-accent-50 p-3 text-left">
          {/* 대화형 보강 루프 — 누적 정보를 hidden으로 되돌리고 추가 입력을 받는다. */}
          <input type="hidden" name="supplements" value={JSON.stringify(state.supplements)} />
          <p className="whitespace-pre-wrap text-xs text-ink-700">{state.request}</p>
          <textarea
            name="supplement"
            rows={4}
            placeholder="추가 정보를 적어주세요. (더 줄 정보가 없으면 빈칸으로 다시 생성 → 있는 정보로 최선을 다합니다)"
            className="mt-2 block w-full rounded-md border border-paper-300 bg-paper-50 px-2.5 py-2 text-xs"
          />
          <Button type="submit" variant="accent" size="sm" disabled={pending} className="mt-2">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            정보 반영해 다시 생성
          </Button>
        </div>
      )}
    </form>
  );
}
