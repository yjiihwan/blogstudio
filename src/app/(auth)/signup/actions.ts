"use server";

import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/passwords";
import { sendTelegramToAdmins } from "@/lib/telegram";

export async function signupAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const err = (msg: string) =>
    redirect(
      `/signup?error=${encodeURIComponent(msg)}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`
    );

  if (!name || !email || !password) err("모든 필드를 입력해주세요.");
  if (password.length < 8) err("비밀번호는 8자 이상이어야 합니다.");
  if (password !== passwordConfirm) err("비밀번호가 일치하지 않습니다.");

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (existing) err("이미 사용 중인 이메일입니다.");

  const passwordHash = await hashPassword(password);
  await db.insert(schema.users).values({
    email,
    passwordHash,
    name,
    role: "user",
    status: "pending",
    isActive: true,
  });

  // 텔레그램 알림 (실패해도 가입 흐름에 영향 없음)
  sendTelegramToAdmins(
    `🆕 새 회원가입 대기\n이름: ${name}\n이메일: ${email}\n승인 필요`
  ).catch(() => null);

  redirect("/login?pending=1");
}
