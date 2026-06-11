"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
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
