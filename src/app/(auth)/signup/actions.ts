"use server";

import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/passwords";
import { notifyAdmins } from "@/lib/notify/notify";
import { normalizePhone } from "@/lib/notify/alimtalk-core";

export async function signupAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  const err = (msg: string) =>
    redirect(
      `/signup?error=${encodeURIComponent(msg)}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phoneRaw)}`
    );

  if (!name || !email || !password) err("모든 필드를 입력해주세요.");
  if (password.length < 8) err("비밀번호는 8자 이상이어야 합니다.");
  if (password !== passwordConfirm) err("비밀번호가 일치하지 않습니다.");
  // 휴대폰 번호는 선택 — 넣었으면 형식만 확인(알림톡 수신처)
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) err("휴대폰 번호 형식이 아닙니다. 예) 010-1234-5678 (비워 두어도 가입할 수 있습니다)");

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
    phone,
  });

  // 관리자 전원에게 카카오 알림톡 (실패해도 가입 흐름에 영향 없음)
  notifyAdmins("signup_pending", { 이름: name, 이메일: email }).catch(() => null);

  redirect("/login?pending=1");
}
