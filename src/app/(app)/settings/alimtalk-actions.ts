"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { NOTIFY_EVENTS, maskPhone, type NotifyEvent } from "@/lib/notify/alimtalk-core";
import { parseSetupVendor, type FieldName, type KeyInput } from "@/lib/notify/alimtalk-setup-core";
import {
  clearLogsForTest,
  confirmTestReceivedStored,
  getSmsFallback,
  resetAlimtalkStored,
  saveKeysStored,
  saveTemplatesStored,
  selectVendorStored,
  setSmsFallback,
  verifyConnectionStored,
  type TemplateCheck,
} from "@/lib/notify/alimtalk-config";
import { sendTestTo } from "@/lib/notify/notify";

/* 알림톡 셀프 연동 마법사 서버 액션 — 전부 admin 전용. 키 원문은 어떤 반환값에도 싣지 않는다. */

export type SetupActionState = { ok: boolean; message: string; tone?: "warn"; needsConfirm?: boolean; checks?: TemplateCheck[] } | null;

async function admin(): Promise<{ ok: true; user: { id: string; name: string; email: string; phone: string | null } } | { ok: false; state: SetupActionState }> {
  try {
    const u = await requireAdmin();
    return { ok: true, user: { id: u.id, name: u.name, email: u.email, phone: u.phone ?? null } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, state: { ok: false, message: msg === "FORBIDDEN" ? "권한이 없습니다(관리자 전용)." : "세션이 만료되었습니다. 다시 로그인해 주세요." } };
  }
}
const done = (r: { ok: boolean; message: string; tone?: "warn"; needsConfirm?: boolean; checks?: TemplateCheck[] }): SetupActionState => {
  revalidatePath("/settings");
  revalidatePath("/account");
  return r;
};

export async function selectAlimtalkVendorAction(_prev: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  const vendor = parseSetupVendor(String(formData.get("vendor") ?? ""));
  if (!vendor) return { ok: false, message: "업체를 골라 주세요." };
  return done(await selectVendorStored(vendor));
}

export async function saveAlimtalkKeysAction(_prev: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  const vendor = parseSetupVendor(String(formData.get("vendor") ?? ""));
  if (!vendor) return { ok: false, message: "업체를 먼저 골라 주세요." };
  const input: KeyInput = {};
  for (const f of ["apiKey", "apiSecret", "senderKey", "senderPhone", "httpUrl", "httpToken"] as FieldName[]) input[f] = String(formData.get(f) ?? "");
  const r = await saveKeysStored(vendor, input, String(formData.get("confirm") ?? "") === "1");
  return r.ok ? done(r) : r;
}

export async function verifyAlimtalkConnectionAction(_prev: SetupActionState, _formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  const r = await verifyConnectionStored();
  return done({ ok: r.ok, message: r.message, tone: r.tone });
}

export async function saveAlimtalkTemplatesAction(_prev: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  const codes: Partial<Record<NotifyEvent, string>> = {};
  for (const e of NOTIFY_EVENTS) codes[e] = String(formData.get(`tpl_${e}`) ?? "");
  const r = await saveTemplatesStored(codes);
  return r.checks ? done(r) : r;
}

export async function sendAlimtalkTestAction(_prev: SetupActionState, _formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  if (!a.user.phone) return { ok: false, message: "관리자 본인 휴대폰 번호가 없습니다. «내 계정 → 알림(카카오 알림톡)»에서 번호를 먼저 등록해 주세요." };
  const r = await sendTestTo(a.user.id);
  const to = maskPhone(a.user.phone);
  if (r.status === "sent" || r.status === "sms_sent") return done({ ok: true, message: `${to} 로 ${r.status === "sms_sent" ? "문자(대체발송)" : "알림톡"}를 보냈습니다. 휴대폰에 도착하면 «받았어요»를 눌러 주세요.` });
  if (r.status === "dry_run") return done({ ok: false, tone: "warn", message: `아직 실제로 보내지 않았습니다(드라이런). ${r.message}` });
  return done({ ok: false, message: `테스트 발송 실패: ${r.message}` });
}

export async function confirmAlimtalkTestAction(_prev: SetupActionState, _formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  return done(await confirmTestReceivedStored(a.user.phone ? maskPhone(a.user.phone) : "", a.user.name || a.user.email));
}

export async function toggleSmsFallbackAction(_prev: SetupActionState, _formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  const next = !(await getSmsFallback());
  await setSmsFallback(next);
  return done({ ok: true, message: next ? "알림톡 실패 시 문자로 대체발송합니다(문자 요금 별도)." : "문자 대체발송을 껐습니다. 알림톡이 실패하면 받는 사람에게 아무것도 가지 않습니다." });
}

export async function resetAlimtalkAction(_prev: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  if (String(formData.get("confirm") ?? "") !== "1") return { ok: false, message: "확인 창에서 «초기화»를 눌러 주세요." };
  return done(await resetAlimtalkStored());
}

/* 발송 이력 비우기 — 테스트 기록 정리용(admin). 설정·키에는 영향 없음 */
export async function clearAlimtalkLogsAction(_prev: SetupActionState, formData: FormData): Promise<SetupActionState> {
  const a = await admin();
  if (!a.ok) return a.state;
  if (String(formData.get("confirm") ?? "") !== "1") return { ok: false, message: "확인 창에서 «비우기»를 눌러 주세요." };
  const n = await clearLogsForTest();
  return done({ ok: true, message: `발송 이력 ${n}건을 지웠습니다.` });
}
