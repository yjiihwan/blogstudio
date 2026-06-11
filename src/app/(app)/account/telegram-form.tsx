"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveTelegramChatIdAction,
  deleteTelegramChatIdAction,
  testTelegramAccountAction,
} from "./actions";

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
    >
      {pending ? "저장 중..." : label}
    </button>
  );
}

type Props = {
  chatId: string | null;
  botTokenSet: boolean;
};

export function TelegramForm({ chatId: initialChatId, botTokenSet }: Props) {
  const [chatId, setChatId] = useState(initialChatId ?? "");
  const [saved, setSaved] = useState(!!initialChatId);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [state, action] = useActionState(
    async (_: { ok: boolean; error?: string } | null, formData: FormData) => {
      const result = await saveTelegramChatIdAction(formData);
      if (result.ok) setSaved(true);
      return result;
    },
    null
  );

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    const result = await testTelegramAccountAction();
    setTestMsg(result);
    setTesting(false);
  }

  async function handleDelete() {
    if (!confirm("Chat ID를 삭제하시겠습니까? 알림을 더 이상 받을 수 없습니다.")) return;
    setDeleting(true);
    await deleteTelegramChatIdAction();
    setChatId("");
    setSaved(false);
    setTestMsg(null);
    setDeleting(false);
  }

  return (
    <div className="space-y-4">
      {!botTokenSet && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          관리자가 봇 토큰을 설정해야 알림이 발송됩니다.
        </p>
      )}

      {saved && (
        <div className="flex items-center justify-between rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-sm">
          <span className="text-ink-600">등록된 Chat ID: <span className="font-mono font-medium">{initialChatId}</span></span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
      )}

      <form action={action} className="flex gap-2">
        <input type="hidden" name="chatId" value={chatId} />
        <input
          type="text"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="예: -1001234567890 또는 123456789"
          className="flex-1 rounded-md border border-paper-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <SubmitBtn label={saved ? "변경" : "저장"} />
      </form>

      {state && !state.ok && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-sm text-green-600">Chat ID가 저장되었습니다.</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !saved}
          className="rounded-md border border-paper-300 px-4 py-2 text-sm font-medium hover:bg-paper-50 disabled:opacity-40"
        >
          {testing ? "전송 중..." : "테스트 메시지 보내기"}
        </button>
        {testMsg && (
          <span className={`text-sm ${testMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {testMsg.message}
          </span>
        )}
      </div>

      <p className="text-xs text-ink-500">
        Chat ID 확인 방법: 텔레그램에서 <span className="font-mono">@userinfobot</span>에 아무 메시지를 보내면 본인 ID를 알려줍니다.
      </p>
    </div>
  );
}
