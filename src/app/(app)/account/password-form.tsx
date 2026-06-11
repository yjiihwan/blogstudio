"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await changePasswordAction(formData);
      if (res.ok) {
        setResult({ ok: true, message: "비밀번호가 변경되었습니다." });
        const form = document.getElementById("password-form") as HTMLFormElement;
        form?.reset();
      } else {
        setResult({ ok: false, message: res.error });
      }
    });
  }

  return (
    <form id="password-form" action={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">현재 비밀번호</Label>
        <div className="relative">
          <Input
            id="currentPassword"
            name="currentPassword"
            type={showCurrent ? "text" : "password"}
            placeholder="현재 비밀번호"
            className="pr-10"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
            tabIndex={-1}
          >
            {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="newPassword">새 비밀번호</Label>
        <div className="relative">
          <Input
            id="newPassword"
            name="newPassword"
            type={showNew ? "text" : "password"}
            placeholder="새 비밀번호 (8자 이상)"
            className="pr-10"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
            tabIndex={-1}
          >
            {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder="새 비밀번호 재입력"
          autoComplete="new-password"
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
