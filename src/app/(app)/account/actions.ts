"use server";

import { db, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { TELEGRAM_TOKEN_KEY } from "@/lib/telegram";
import { issueLinkCode, getBotUsername } from "@/lib/telegram-link";
import { maskPhone, normalizePhone, phoneLabel } from "@/lib/notify/alimtalk-core";
import { resolveAlimtalk } from "@/lib/notify/alimtalk-config";
import { sendTestTo } from "@/lib/notify/notify";

export async function getAccountInfo() {
  const user = await requireUser();
  return {
    email: user.email,
    name: user.name,
    role: user.role as "admin" | "user",
    createdAt: user.createdAt,
  };
}

export async function changePasswordAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, error: "모든 항목을 입력해주세요." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "새 비밀번호는 8자 이상이어야 합니다." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "새 비밀번호가 일치하지 않습니다." };
  }

  const match = await verifyPassword(currentPassword, user.passwordHash);
  if (!match) {
    return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  return { ok: true };
}

export async function changeEmailAction(
  formData: FormData
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const newEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!newEmail) return { ok: false, error: "이메일을 입력해주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { ok: false, error: "올바른 이메일 형식이 아닙니다." };
  }
  if (newEmail === user.email) {
    return { ok: false, error: "현재 이메일과 동일합니다." };
  }

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, newEmail),
  });
  if (existing) {
    return { ok: false, error: "이미 사용 중인 이메일입니다." };
  }

  await db
    .update(schema.users)
    .set({ email: newEmail, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  revalidatePath("/account");
  return { ok: true, email: newEmail };
}

export async function getTelegramChatIdInfo(): Promise<{
  chatId: string | null;
  botTokenSet: boolean;
}> {
  const user = await requireUser();
  const tokenRow = await db.query.settings.findFirst({
    where: eq(schema.settings.key, TELEGRAM_TOKEN_KEY),
  });
  const botTokenSet = !!(tokenRow && JSON.parse(tokenRow.valueJson));
  return { chatId: user.telegramChatId ?? null, botTokenSet };
}

export async function getTelegramLinkInfo(): Promise<{
  connected: boolean;
  chatId: string | null;
  botTokenSet: boolean;
  botUsername: string | null;
}> {
  const user = await requireUser();
  const tokenRow = await db.query.settings.findFirst({
    where: eq(schema.settings.key, TELEGRAM_TOKEN_KEY),
  });
  const botTokenSet = !!(tokenRow && JSON.parse(tokenRow.valueJson));
  const botUsername = botTokenSet ? await getBotUsername() : null;
  return {
    connected: !!user.telegramChatId,
    chatId: user.telegramChatId ?? null,
    botTokenSet,
    botUsername,
  };
}

// 딥링크/수동 연결용 일회성 코드 발급. 봇토큰은 노출하지 않고 username·딥링크만 반환.
export async function createTelegramLinkCodeAction(): Promise<
  | { ok: true; deepLink: string | null; botUsername: string | null; code: string; expiresMin: number }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const tokenRow = await db.query.settings.findFirst({
    where: eq(schema.settings.key, TELEGRAM_TOKEN_KEY),
  });
  const botTokenSet = !!(tokenRow && JSON.parse(tokenRow.valueJson));
  if (!botTokenSet) {
    return { ok: false, error: "관리자가 봇 토큰을 설정해야 연결할 수 있습니다." };
  }
  const { deepLink, botUsername, code, expiresMin } = await issueLinkCode(user.id);
  if (!botUsername) {
    return { ok: false, error: "봇 사용자명을 확인할 수 없습니다. 관리자에게 문의하세요." };
  }
  return { ok: true, deepLink, botUsername, code, expiresMin };
}

export async function saveTelegramChatIdAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const chatId = String(formData.get("chatId") ?? "").trim();
  if (!chatId) return { ok: false, error: "Chat ID를 입력해주세요." };

  await db
    .update(schema.users)
    .set({ telegramChatId: chatId, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  revalidatePath("/account");
  return { ok: true };
}

export async function deleteTelegramChatIdAction(): Promise<{ ok: true }> {
  const user = await requireUser();
  await db
    .update(schema.users)
    .set({ telegramChatId: null, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/account");
  return { ok: true };
}

export async function testTelegramAccountAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const user = await requireUser();
  if (!user.telegramChatId) {
    return { ok: false, message: "Chat ID가 저장되지 않았습니다." };
  }

  const tokenRow = await db.query.settings.findFirst({
    where: eq(schema.settings.key, TELEGRAM_TOKEN_KEY),
  });
  if (!tokenRow) return { ok: false, message: "봇 토큰이 설정되지 않았습니다. 관리자에게 문의하세요." };
  const token = JSON.parse(tokenRow.valueJson) as string | null;
  if (!token) return { ok: false, message: "봇 토큰이 설정되지 않았습니다. 관리자에게 문의하세요." };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: user.telegramChatId,
          text: "✅ 텔레그램 알림 테스트 메시지입니다!",
          parse_mode: "HTML",
        }),
        cache: "no-store",
      }
    );
    if (res.ok) return { ok: true, message: "테스트 메시지 전송 완료 ✓" };
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    const desc = data.description ?? `HTTP ${res.status}`;
    // "chat not found"는 Chat ID 오류가 아니라, 사용자가 봇과 대화를 시작하지 않은 것이다.
    // 텔레그램 봇은 먼저 말을 건 사용자에게만 메시지를 보낼 수 있다.
    if (/chat not found/i.test(desc)) {
      let botName = "봇";
      try {
        const me = (await fetch(
          `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`,
          { cache: "no-store" }
        ).then((r) => r.json())) as { ok?: boolean; result?: { username?: string } };
        if (me?.ok && me.result?.username) botName = `@${me.result.username}`;
      } catch {
        /* getMe 실패는 무시 — 안내 메시지만 일반화 */
      }
      return {
        ok: false,
        message: `텔레그램에서 ${botName} 을(를) 찾아 먼저 '시작(Start)'을 눌러 대화를 시작한 뒤 다시 시도해주세요. (봇은 먼저 말을 건 사용자에게만 알림을 보낼 수 있습니다)`,
      };
    }
    if (/Bad Request/i.test(desc)) {
      return { ok: false, message: `Chat ID가 올바르지 않습니다. (${desc.slice(0, 60)})` };
    }
    return { ok: false, message: `전송 실패: ${desc.slice(0, 80)}` };
  } catch (err) {
    return {
      ok: false,
      message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`,
    };
  }
}

/* ───────── 카카오 알림톡 수신 설정(2026-10-13, 텔레그램 연결 폼 대체) ───────── */
export type NotifyInfo = {
  phone: string | null; // 010-1234-5678 표기
  phoneMasked: string | null;
  enabled: boolean;
  setupComplete: boolean; // 관리자 연동 4칸 전부 완료(실발송 상태)
  setupReason: string;
  isAdmin: boolean;
};
export async function getNotifyInfo(): Promise<NotifyInfo> {
  const user = await requireUser();
  const r = await resolveAlimtalk();
  return {
    phone: user.phone ? phoneLabel(user.phone) : null,
    phoneMasked: user.phone ? maskPhone(user.phone) : null,
    enabled: user.notifyEnabled !== false,
    setupComplete: r.mode.mode === "live",
    setupReason: r.mode.mode === "dryrun" ? r.mode.reason : "",
    isAdmin: user.role === "admin",
  };
}

export async function savePhoneAction(formData: FormData): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const raw = String(formData.get("phone") ?? "").trim();
  if (!raw) {
    await db.update(schema.users).set({ phone: null, updatedAt: new Date().toISOString() }).where(eq(schema.users.id, user.id));
    revalidatePath("/account");
    return { ok: true, phone: "" };
  }
  const phone = normalizePhone(raw);
  if (!phone) return { ok: false, error: "휴대폰 번호 형식이 아닙니다. 예) 010-1234-5678 (알림톡은 휴대폰 번호로만 받을 수 있습니다)" };
  await db.update(schema.users).set({ phone, updatedAt: new Date().toISOString() }).where(eq(schema.users.id, user.id));
  revalidatePath("/account");
  revalidatePath("/settings");
  return { ok: true, phone: phoneLabel(phone) };
}

export async function toggleNotifyAction(enabled: boolean): Promise<{ ok: true; enabled: boolean }> {
  const user = await requireUser();
  await db.update(schema.users).set({ notifyEnabled: enabled, updatedAt: new Date().toISOString() }).where(eq(schema.users.id, user.id));
  revalidatePath("/account");
  return { ok: true, enabled };
}

export async function sendTestNotifyAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!user.phone) return { ok: false, message: "휴대폰 번호를 먼저 저장해 주세요." };
  const r = await resolveAlimtalk();
  if (r.mode.mode !== "live") return { ok: false, message: "관리자가 알림톡 연동을 아직 완료하지 않았습니다. 연동이 끝나면 이 버튼으로 테스트할 수 있습니다." };
  const out = await sendTestTo(user.id);
  revalidatePath("/settings");
  if (out.status === "sent") return { ok: true, message: `${maskPhone(user.phone)} 로 테스트 알림톡을 보냈습니다. 카카오톡을 확인해 주세요.` };
  if (out.status === "sms_sent") return { ok: true, message: `알림톡 대신 문자로 보냈습니다(${maskPhone(user.phone)}).` };
  return { ok: false, message: `발송 실패: ${out.message}` };
}
