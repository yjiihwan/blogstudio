"use server";

import { db, schema } from "@/db/client";
import { revalidatePath } from "next/cache";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { TELEGRAM_TOKEN_KEY } from "@/lib/telegram";

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
    if (desc.includes("chat not found") || desc.includes("Bad Request")) {
      return { ok: false, message: "Chat ID가 올바르지 않습니다." };
    }
    return { ok: false, message: `전송 실패: ${desc.slice(0, 80)}` };
  } catch (err) {
    return {
      ok: false,
      message: `연결 실패: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`,
    };
  }
}
