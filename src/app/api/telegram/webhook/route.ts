import { NextRequest, NextResponse } from "next/server";
import { consumeLinkCode, getWebhookSecret } from "@/lib/telegram-link";
import { sendTelegramRawMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 텔레그램 봇 업데이트 수신용 webhook. /start <code> 를 파싱해 chat_id 를 유저에 매핑한다.
// 항상 200 을 반환해야 텔레그램이 재시도하지 않는다(인증 실패만 401).
export async function POST(req: NextRequest) {
  const expected = await getWebhookSecret();
  if (expected) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msg =
    (update as { message?: unknown; edited_message?: unknown })?.message ??
    (update as { edited_message?: unknown })?.edited_message;
  const text = (msg as { text?: string } | undefined)?.text ?? "";
  const chatId = (msg as { chat?: { id?: number | string } } | undefined)?.chat?.id;
  if (!text || chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }
  const chatIdStr = String(chatId);

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.trim();
    if (code) {
      const user = await consumeLinkCode(code, chatIdStr);
      if (user) {
        await sendTelegramRawMessage(
          chatIdStr,
          `✅ <b>${escapeHtml(user.name)}</b>님, 블로그 스튜디오 알림이 연결되었습니다.\n이제 초안 생성·발행 등 알림을 이 채팅으로 받게 됩니다.`
        );
      } else {
        await sendTelegramRawMessage(
          chatIdStr,
          "⚠️ 연결 코드가 유효하지 않거나 만료되었습니다(15분). 사이트의 <b>내 계정 → 텔레그램 알림</b>에서 다시 시도해주세요."
        );
      }
    } else {
      await sendTelegramRawMessage(
        chatIdStr,
        "안녕하세요! 블로그 스튜디오 알림 봇입니다.\n사이트 <b>내 계정 → 텔레그램 알림</b>에서 '텔레그램으로 연결하기' 버튼을 눌러 연결해주세요."
      );
    }
  }

  return NextResponse.json({ ok: true });
}
