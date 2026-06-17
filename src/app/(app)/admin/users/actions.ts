"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { sendTelegramToUser } from "@/lib/telegram";
import { env } from "@/lib/env";

export async function changeRoleAction(userId: string, newRole: "admin" | "user") {
  await requireAdmin();
  await db
    .update(schema.users)
    .set({ role: newRole })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
}

export async function toggleActiveAction(userId: string, isActive: boolean) {
  await requireAdmin();
  await db
    .update(schema.users)
    .set({ isActive })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
}

export async function deleteUserAction(userId: string) {
  await requireAdmin();
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
}

export async function approveUserAction(userId: string) {
  await requireAdmin();
  await db
    .update(schema.users)
    .set({ status: "approved" })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
  sendTelegramToUser(
    userId,
    `✅ 계정이 승인되었습니다!\n이제 로그인하실 수 있습니다.\n${env.APP_URL}/login`
  ).catch(() => null);
}

export async function rejectUserAction(userId: string) {
  await requireAdmin();
  await db
    .update(schema.users)
    .set({ status: "rejected", isActive: false })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
  sendTelegramToUser(
    userId,
    `❌ 계정 승인이 거부되었습니다.\n자세한 내용은 관리자에게 문의하세요.`
  ).catch(() => null);
}

/**
 * 어드민이 특정 사용자의 비밀번호를 재설정한다.
 * 안전을 위해 어드민이 직접 입력하지 않고 임시 비밀번호를 생성해 돌려준다.
 * 어드민이 이 값을 사용자에게 전달하고, 사용자는 로그인 후 [내 계정]에서 변경한다.
 */
export async function resetPasswordAction(
  userId: string
): Promise<{ ok: true; tempPassword: string } | { ok: false; error: string }> {
  await requireAdmin();
  const target = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!target) return { ok: false, error: "사용자를 찾을 수 없습니다." };

  // 헷갈리는 문자(0/O/1/l/I) 제외한 12자 임시 비밀번호 (규칙: 8자 이상 충족)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let tempPassword = "";
  for (let i = 0; i < 12; i++) tempPassword += alphabet[bytes[i] % alphabet.length];

  const newHash = await hashPassword(tempPassword);
  await db
    .update(schema.users)
    .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, userId));

  // 사용자에게 텔레그램 연결돼 있으면 안내(임시 비번 자체는 보안상 텔레그램에 안 싣고 안내만)
  sendTelegramToUser(
    userId,
    `🔑 관리자가 비밀번호를 재설정했습니다.\n관리자에게 임시 비밀번호를 받아 로그인 후 [내 계정]에서 변경해주세요.`
  ).catch(() => null);

  revalidatePath("/admin/users");
  return { ok: true, tempPassword };
}

export async function setApiKeyModeAction(
  userId: string,
  mode: "system" | "user_key"
) {
  const me = await requireAdmin();
  if (userId === me.id) return;
  await db
    .update(schema.users)
    .set({ apiKeyMode: mode })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
}

export async function setImageApiKeyModeAction(
  userId: string,
  mode: "system" | "user_key"
) {
  const me = await requireAdmin();
  if (userId === me.id) return;
  await db
    .update(schema.users)
    .set({ imageApiKeyMode: mode })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
}
