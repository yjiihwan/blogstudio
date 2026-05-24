"use server";

import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  setSessionCookie,
  signSession,
  verifyPassword,
} from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(
      `/login?error=${encodeURIComponent("이메일과 비밀번호를 입력해주세요.")}`
    );
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  const invalid = `/login?error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}&email=${encodeURIComponent(email)}`;
  if (!user) redirect(invalid);

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) redirect(invalid);

  const token = await signSession({ uid: user.id, role: user.role });
  await setSessionCookie(token);
  redirect("/dashboard");
}
