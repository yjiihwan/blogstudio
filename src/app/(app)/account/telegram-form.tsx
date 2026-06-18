"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveTelegramChatIdAction,
  deleteTelegramChatIdAction,
  testTelegramAccountAction,
  createTelegramLinkCodeAction,
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
  connected: boolean;
  chatId: string | null;
  botTokenSet: boolean;
  botUsername: string | null;
};

export function TelegramForm({ connected, chatId, botTokenSet, botUsername }: Props) {
  const router = useRouter();
  const [manualChatId, setManualChatId] = useState(chatId ?? "");
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // 연결 시작(딥링크) 상태
  const [linking, startLinking] = useTransition();
  const [link, setLink] = useState<{ deepLink: string | null; botUsername: string | null; code: string; expiresMin: number } | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  const [state, action] = useActionState(
    async (_: { ok: boolean; error?: string } | null, formData: FormData) => {
      const result = await saveTelegramChatIdAction(formData);
      if (result.ok) router.refresh();
      return result;
    },
    null
  );

  function handleConnect() {
    setLinkErr(null);
    startLinking(async () => {
      const r = await createTelegramLinkCodeAction();
      if (!r.ok) {
        setLinkErr(r.error);
        return;
      }
      setLink({ deepLink: r.deepLink, botUsername: r.botUsername, code: r.code, expiresMin: r.expiresMin });
      if (r.deepLink) window.open(r.deepLink, "_blank", "noopener,noreferrer");
    });
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    const result = await testTelegramAccountAction();
    setTestMsg(result);
    setTesting(false);
  }

  async function handleDelete() {
    if (!confirm("텔레그램 알림 연결을 해제하시겠습니까? 더 이상 알림을 받을 수 없습니다.")) return;
    setDeleting(true);
    await deleteTelegramChatIdAction();
    setManualChatId("");
    setTestMsg(null);
    setLink(null);
    setDeleting(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!botTokenSet && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          관리자가 봇 토큰을 설정해야 알림을 연결할 수 있습니다.
        </p>
      )}

      {connected ? (
        <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm">
          <span className="text-green-700 font-medium">✅ 텔레그램 알림이 연결되어 있습니다</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? "해제 중..." : "연결 해제"}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-paper-200 bg-paper-50 px-4 py-4">
          <div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={linking || !botTokenSet}
              className="rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {linking ? "연결 코드 생성 중..." : "텔레그램으로 연결하기"}
            </button>
            <p className="mt-2 text-xs text-ink-500 leading-relaxed">
              버튼을 누르면 텔레그램 앱이 열립니다. <strong>시작(Start)</strong>을 누르면 본인 계정에 자동으로 연결됩니다.
            </p>
          </div>

          {linkErr && <p className="text-sm text-red-600">{linkErr}</p>}

          {link && (
            <div className="space-y-2 rounded-md border border-paper-200 bg-white px-3 py-3 text-xs text-ink-600">
              <p className="text-ink-700 font-medium">텔레그램에서 시작을 누르면 연결됩니다 (코드 {link.expiresMin}분 유효).</p>
              {link.deepLink && (
                <p>
                  앱이 안 열렸다면{" "}
                  <a href={link.deepLink} target="_blank" rel="noopener noreferrer" className="text-accent-600 underline underline-offset-4 break-all">
                    이 링크
                  </a>
                  를 누르세요.
                </p>
              )}
              {link.botUsername && (
                <p className="leading-relaxed">
                  또는 텔레그램에서 <span className="font-mono font-medium">@{link.botUsername}</span> 를 검색해 아래 메시지를 보내세요:
                  <br />
                  <code className="mt-1 inline-block rounded bg-paper-100 px-2 py-1 font-mono select-all">/start {link.code}</code>
                </p>
              )}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="mt-1 rounded-md border border-paper-300 px-3 py-1.5 text-xs font-medium hover:bg-paper-50"
              >
                연결 상태 새로고침
              </button>
            </div>
          )}
        </div>
      )}

      {connected && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
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
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs text-ink-500 hover:text-ink-700 underline underline-offset-4"
        >
          {showManual ? "직접 Chat ID 입력 닫기" : "고급: 직접 Chat ID 입력"}
        </button>
        {showManual && (
          <div className="mt-3 space-y-2">
            <form action={action} className="flex gap-2">
              <input type="hidden" name="chatId" value={manualChatId} />
              <input
                type="text"
                value={manualChatId}
                onChange={(e) => setManualChatId(e.target.value)}
                placeholder="예: -1001234567890 또는 123456789"
                className="flex-1 rounded-md border border-paper-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <SubmitBtn label="저장" />
            </form>
            {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
            <p className="text-xs text-ink-500">
              그룹 채팅 등에 쓸 때만 사용하세요. 개인 알림은 위 “텔레그램으로 연결하기”를 권장합니다. Chat ID는{" "}
              <span className="font-mono">@userinfobot</span>에 메시지를 보내면 확인할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
