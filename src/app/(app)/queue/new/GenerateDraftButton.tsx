"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
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
        <Sparkles className="size-4" />
        {pending ? "생성 중..." : "초안 생성"}
      </Button>
      {state?.error && (
        <p className="text-xs text-destructive max-w-[200px] text-right">
          {state.error}
        </p>
      )}
    </form>
  );
}
