// 텔레그램 알림 "셀프 연결" 로직.
// 유저가 봇 @username 으로 /start <코드> 만 누르면 본인 계정에 chat_id 가 자동 매핑된다.
// 봇 토큰은 절대 프론트로 나가지 않는다(여기서만 서버측으로 사용).
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getTelegramBotToken } from "@/lib/telegram";

const BOT_USERNAME_KEY = "telegram_bot_username";
const WEBHOOK_SECRET_KEY = "telegram_webhook_secret";
export const LINK_CODE_TTL_MIN = 15;

async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  if (!row) return null;
  return JSON.parse(row.valueJson) as string | null;
}

async function saveSetting(key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, valueJson: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { valueJson: JSON.stringify(value), updatedAt: new Date().toISOString() },
    });
}

/**
 * 봇 @username(@ 제외) 해석. 순서: settings 캐시 → env TELEGRAM_BOT_USERNAME → getMe(토큰)→캐시.
 * 하드코딩하지 않으며, 토큰은 외부로 반환하지 않는다.
 */
export async function getBotUsername(): Promise<string | null> {
  const cached = await getSetting(BOT_USERNAME_KEY);
  if (cached) return cached;

  const envName = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  if (envName) {
    await saveSetting(BOT_USERNAME_KEY, envName);
    return envName;
  }

  const token = await getTelegramBotToken();
  if (!token) return null;
  try {
    const me = (await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`,
      { cache: "no-store" }
    ).then((r) => r.json())) as { ok?: boolean; result?: { username?: string } };
    if (me?.ok && me.result?.username) {
      await saveSetting(BOT_USERNAME_KEY, me.result.username);
      return me.result.username;
    }
  } catch {
    // getMe 실패 → username 미확정
  }
  return null;
}

/** 봇 토큰 변경 시 username 캐시 무효화(다른 봇으로 교체될 수 있으므로). */
export async function clearBotUsernameCache(): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, BOT_USERNAME_KEY));
}

export async function getWebhookSecret(): Promise<string | null> {
  return getSetting(WEBHOOK_SECRET_KEY);
}

/** 웹훅 검증용 secret_token(없으면 생성·저장). */
export async function ensureWebhookSecret(): Promise<string> {
  const existing = await getSetting(WEBHOOK_SECRET_KEY);
  if (existing) return existing;
  const secret = nanoid(32);
  await saveSetting(WEBHOOK_SECRET_KEY, secret);
  return secret;
}

export type LinkCodeResult = {
  code: string;
  deepLink: string | null;
  botUsername: string | null;
  expiresMin: number;
};

/** 유저에게 일회성 연결코드 발급(TTL). 딥링크와 봇 username 동봉. */
export async function issueLinkCode(userId: string): Promise<LinkCodeResult> {
  const code = nanoid(20);
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MIN * 60_000).toISOString();
  await db
    .update(schema.users)
    .set({
      telegramLinkCode: code,
      telegramLinkExpires: expiresAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.users.id, userId));

  const botUsername = await getBotUsername();
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  return { code, deepLink, botUsername, expiresMin: LINK_CODE_TTL_MIN };
}

/** /start <code> 처리: 유효·미만료 코드면 해당 유저에 chat_id 매핑하고 코드 소거. */
export async function consumeLinkCode(
  code: string,
  chatId: string
): Promise<{ id: string; name: string } | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.telegramLinkCode, code),
  });
  if (!user) return null;

  const expired =
    !user.telegramLinkExpires ||
    new Date(user.telegramLinkExpires).getTime() < Date.now();
  if (expired) {
    await db
      .update(schema.users)
      .set({ telegramLinkCode: null, telegramLinkExpires: null })
      .where(eq(schema.users.id, user.id));
    return null;
  }

  await db
    .update(schema.users)
    .set({
      telegramChatId: chatId,
      telegramLinkCode: null,
      telegramLinkExpires: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.users.id, user.id));
  return { id: user.id, name: user.name };
}
