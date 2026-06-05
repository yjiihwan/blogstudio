import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export const TELEGRAM_TOKEN_KEY = "telegram_bot_token";
export const TELEGRAM_CHAT_ID_KEY = "telegram_chat_id";

async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  if (!row) return null;
  return JSON.parse(row.valueJson) as string | null;
}

export async function sendTelegramNotification(
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const [token, chatId] = await Promise.all([
    getSetting(TELEGRAM_TOKEN_KEY),
    getSetting(TELEGRAM_CHAT_ID_KEY),
  ]);
  if (!token || !chatId) return { ok: false, error: "Telegram 설정 없음" };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
        cache: "no-store",
      }
    );
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    return { ok: false, error: data.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
