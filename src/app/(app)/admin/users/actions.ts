"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

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
}

export async function rejectUserAction(userId: string) {
  await requireAdmin();
  await db
    .update(schema.users)
    .set({ status: "rejected", isActive: false })
    .where(eq(schema.users.id, userId));
  revalidatePath("/admin/users");
}
