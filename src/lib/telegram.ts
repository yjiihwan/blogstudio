import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export const TELEGRAM_TOKEN_KEY = "telegram_bot_token";

async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  if (!row) return null;
  return JSON.parse(row.valueJson) as string | null;
}

async function getBotToken(): Promise<string | null> {
  return getSetting(TELEGRAM_TOKEN_KEY);
}

/** 봇 토큰을 반환(연결/웹훅 모듈에서 사용). 절대 프론트로 노출하지 말 것. */
export async function getTelegramBotToken(): Promise<string | null> {
  return getBotToken();
}

/** chat_id 로 직접 메시지 발송(웹훅 응답용). 토큰 없으면 no-op. */
export async function sendTelegramRawMessage(chatId: string, message: string): Promise<void> {
  const token = await getBotToken();
  if (!token) return;
  await sendMessage(token, chatId, message);
}

async function sendMessage(
  token: string,
  chatId: string,
  message: string
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    console.error("[telegram] sendMessage failed:", data.description ?? `HTTP ${res.status}`);
  }
}

// NOTE: 전역 단일 Chat ID 기반 알림(sendTelegramNotification)은 제거됨.
// 알림은 계정별 sendTelegramToUser()로 발송한다.
// 추후 어드민 전체 공지가 필요하면 sendTelegramToAdmins()를 사용한다.

/** Send a message to a specific user's telegramChatId. No-op if not configured. */
export async function sendTelegramToUser(
  userId: string,
  message: string
): Promise<void> {
  try {
    const token = await getBotToken();
    if (!token) return;

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user?.telegramChatId) return;

    await sendMessage(token, user.telegramChatId, message);
  } catch (err) {
    console.error("[telegram] sendTelegramToUser failed:", err);
  }
}

/** Send a message to all admin users who have telegramChatId set. */
export async function sendTelegramToAdmins(message: string): Promise<void> {
  try {
    const token = await getBotToken();
    if (!token) return;

    const admins = await db.query.users.findMany({
      where: eq(schema.users.role, "admin"),
    });

    await Promise.allSettled(
      admins
        .filter((a) => a.telegramChatId)
        .map((a) => sendMessage(token, a.telegramChatId!, message))
    );
  } catch (err) {
    console.error("[telegram] sendTelegramToAdmins failed:", err);
  }
}
