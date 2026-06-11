"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEmailAction } from "./actions";

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [displayEmail, setDisplayEmail] = useState(currentEmail);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await changeEmailAction(formData);
      if (res.ok) {
        setDisplayEmail(res.email);
        setResult({ ok: true, message: "이메일이 변경되었습니다." });
        const form = document.getElementById("email-form") as HTMLFormElement;
        form?.reset();
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <form id="email-form" action={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">새 이메일</Label>
        <p className="text-xs text-ink-500">현재: {displayEmail}</p>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="새 이메일 주소"
          autoComplete="email"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          변경
        </Button>
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-600" : "text-red-600"}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
