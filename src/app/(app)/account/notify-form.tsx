"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { savePhoneAction, sendTestNotifyAction, toggleNotifyAction, type NotifyInfo } from "./actions";

/* «알림(카카오 알림톡)» — 휴대폰 번호 저장 · 알림 받기 켬끔 · 테스트 발송(2026-10-13, 텔레그램 연결 폼 대체) */
export function NotifyForm({ info }: { info: NotifyInfo }) {
  const router = useRouter();
  const [phone, setPhone] = useState(info.phone ?? "");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(info.enabled);
  const [saving, startSave] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [testing, startTest] = useTransition();

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaveMsg(null);
    startSave(async () => {
      const r = await savePhoneAction(fd);
      if (r.ok) {
        setPhone(r.phone);
        setSaveMsg({ ok: true, text: r.phone ? `저장했습니다 — ${r.phone}` : "번호를 지웠습니다. 알림이 가지 않습니다." });
        router.refresh();
      } else setSaveMsg({ ok: false, text: r.error });
    });
  };
  const onToggle = (next: boolean) => {
    setEnabled(next);
    startToggle(async () => {
      await toggleNotifyAction(next);
      router.refresh();
    });
  };
  const onTest = () => {
    setTestMsg(null);
    startTest(async () => {
      const r = await sendTestNotifyAction();
      setTestMsg({ ok: r.ok, text: r.message });
    });
  };

  return (
    <div className="space-y-4" data-testid="notify-form">
      {!info.setupComplete && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" data-testid="notify-setup-note">
          {info.isAdmin ? (
            <>
              알림톡 연동이 아직 완료되지 않아 지금은 <b>기록만</b> 남습니다(드라이런). <a href="/settings" className="underline underline-offset-2">설정 → 알림 채널(카카오 알림톡)</a>에서 연동을 마쳐 주세요.
            </>
          ) : (
            <>관리자가 알림톡 연동을 아직 완료하지 않았습니다. 번호는 지금 저장해 두면 연동이 끝나는 대로 알림이 옵니다.</>
          )}
        </p>
      )}

      <form onSubmit={onSave} className="space-y-2" data-testid="notify-phone-form">
        <label htmlFor="notify-phone" className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
          휴대폰 번호
        </label>
        <div className="flex gap-2">
          <Input id="notify-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" className="flex-1" />
          <Button type="submit" variant="accent" size="md" disabled={saving} data-testid="notify-phone-save">
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
        {saveMsg && (
          <p className={`text-sm ${saveMsg.ok ? "text-green-700" : "text-red-600"}`} data-testid="notify-phone-msg">
            {saveMsg.text}
          </p>
        )}
        <p className="text-xs text-ink-500 leading-relaxed">
          카카오톡이 설치된 본인 휴대폰 번호를 넣어 주세요. 계정 승인·게시물 발행 등의 알림이 카카오 알림톡으로 옵니다{info.isAdmin ? " (관리자는 새 회원가입 알림도 이 번호로 받습니다)" : ""}. 비워서 저장하면 번호가 지워집니다.
        </p>
      </form>

      <div className="flex items-center justify-between rounded-md border border-paper-200 bg-paper-50 px-4 py-3">
        <div>
          <div className="text-sm font-medium">알림 받기</div>
          <div className="text-xs text-ink-500">끄면 번호는 남고 알림만 가지 않습니다.</div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={toggling} aria-label="알림 받기" data-testid="notify-toggle" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button" variant="outline" size="md" onClick={onTest} disabled={testing || !info.phone} data-testid="notify-test">
          {testing ? "보내는 중…" : "테스트 발송"}
        </Button>
        {testMsg && (
          <span className={`text-sm ${testMsg.ok ? "text-green-700" : "text-red-600"}`} data-testid="notify-test-msg">
            {testMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}
