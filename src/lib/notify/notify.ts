import "server-only";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { TEMPLATES, fillVars, renderTemplate, type NotifyEvent } from "./alimtalk-core";
import { appendLog, resolveAlimtalk } from "./alimtalk-config";
import { providerFor } from "./alimtalk";
import { mockEnabled } from "./alimtalk-mock";

/* 공용 알림 함수 — 텔레그램 sendTelegramToUser/sendTelegramToAdmins 를 대체(2026-10-13).
   · notifyUser(userId, event, vars)  해당 유저의 휴대폰으로(번호 없음·알림 끔이면 «건너뜀» 기록)
   · notifyAdmins(event, vars)        관리자 전원(번호 있고 알림 켠 사람)
   · sendTestTo(userId)               «테스트 발송» — 체크리스트의 테스트 칸 전이라도 1~4단계가 끝났으면 실제로 보낸다
   어떤 경우에도 throw 하지 않는다 → 호출처의 가입·승인·발행 흐름을 절대 막지 않음(.catch 는 호출처가 한 번 더 건다). */

export type NotifyOptions = {
  /* 발행 어댑터가 모의발행(PUBLISH_DRY_RUN)일 때. 테스트서버 모의 응답 모드가 아니면 외부로 나가지 않게 드라이런으로 기록만 */
  publishDryRun?: boolean;
};
export type NotifyOutcome = { status: "sent" | "sms_sent" | "dry_run" | "failed" | "skipped"; message: string };

type Target = { userId: string | null; phone: string | null; enabled: boolean; name: string };

async function deliver(event: NotifyEvent | "test", target: Target, vars: Record<string, string>, opts: NotifyOptions = {}): Promise<NotifyOutcome> {
  const tplEvent: NotifyEvent = event === "test" ? "signup_pending" : event;
  const text = renderTemplate(TEMPLATES[tplEvent].text, vars);
  try {
    if (!target.phone) {
      await appendLog({ userId: target.userId, event, to: "", templateCode: "", status: "skipped", error: "수신 번호 없음 — 내 계정에서 휴대폰 번호를 등록해 주세요" });
      return { status: "skipped", message: "수신 번호가 없어 보내지 않았습니다." };
    }
    if (!target.enabled) {
      await appendLog({ userId: target.userId, event, to: target.phone, templateCode: "", status: "skipped", error: "알림 받기 꺼짐" });
      return { status: "skipped", message: "알림 받기가 꺼져 있어 보내지 않았습니다." };
    }
    const resolved = await resolveAlimtalk();
    const mode = event === "test" ? resolved.testMode : resolved.mode;
    const templateCode = resolved.env.templates[tplEvent] ?? "";
    if (mode.mode === "dryrun") {
      await appendLog({ userId: target.userId, event, to: target.phone, templateCode, status: "dry_run", error: mode.reason });
      return { status: "dry_run", message: `드라이런(기록만) — ${mode.reason}` };
    }
    if (opts.publishDryRun && !mockEnabled()) {
      await appendLog({ userId: target.userId, event, to: target.phone, templateCode, status: "dry_run", error: "모의발행(PUBLISH_DRY_RUN) — 테스트서버에서는 외부 알림을 보내지 않음" });
      return { status: "dry_run", message: "모의발행 환경이라 기록만 남겼습니다." };
    }
    const provider = providerFor(resolved.env.vendor);
    if (!provider) {
      await appendLog({ userId: target.userId, event, to: target.phone, templateCode, status: "dry_run", error: "발송 업체 없음" });
      return { status: "dry_run", message: "발송 업체가 없어 기록만 남겼습니다." };
    }
    const r = await provider.send({ to: target.phone, templateCode, vars, text, smsFallback: resolved.smsFallback }, resolved.env);
    if (!r.ok) {
      await appendLog({ userId: target.userId, event, to: target.phone, templateCode, status: "failed", error: r.error ?? "업체 응답 없음" });
      console.error(`[alimtalk] send failed event=${event} to=***${target.phone.slice(-4)}: ${r.error}`);
      return { status: "failed", message: r.error ?? "발송 실패" };
    }
    const status = r.channel === "sms" ? "sms_sent" : "sent";
    await appendLog({ userId: target.userId, event, to: target.phone, templateCode, status, providerMessageId: r.providerMessageId });
    return { status, message: status === "sms_sent" ? "알림톡 대신 문자로 보냈습니다." : "알림톡을 보냈습니다." };
  } catch (err) {
    /* 이력 기록조차 실패해도 본 흐름은 막지 않는다 */
    console.error("[alimtalk] deliver failed:", err);
    return { status: "failed", message: err instanceof Error ? err.message : String(err) };
  }
}

async function loadUser(userId: string): Promise<Target | null> {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u) return null;
  return { userId: u.id, phone: u.phone ?? null, enabled: u.notifyEnabled !== false, name: u.name };
}

export async function notifyUser(userId: string, event: NotifyEvent, vars: Record<string, string>, opts: NotifyOptions = {}): Promise<NotifyOutcome> {
  try {
    const t = await loadUser(userId);
    if (!t) return { status: "skipped", message: "사용자를 찾을 수 없습니다." };
    return await deliver(event, t, fillVars(event, vars), opts);
  } catch (err) {
    console.error("[alimtalk] notifyUser failed:", err);
    return { status: "failed", message: String(err) };
  }
}

export async function notifyAdmins(event: NotifyEvent, vars: Record<string, string>, opts: NotifyOptions = {}): Promise<NotifyOutcome[]> {
  try {
    const admins = await db.query.users.findMany({ where: eq(schema.users.role, "admin") });
    const active = admins.filter((a) => a.isActive);
    if (active.length === 0) return [];
    const filled = fillVars(event, vars);
    const results = await Promise.allSettled(active.map((a) => deliver(event, { userId: a.id, phone: a.phone ?? null, enabled: a.notifyEnabled !== false, name: a.name }, filled, opts)));
    return results.map((r) => (r.status === "fulfilled" ? r.value : { status: "failed" as const, message: String(r.reason) }));
  } catch (err) {
    console.error("[alimtalk] notifyAdmins failed:", err);
    return [{ status: "failed", message: String(err) }];
  }
}

/* «테스트 발송» — 본인 번호로 가입대기 템플릿에 예시 값을 채워 보낸다 */
export async function sendTestTo(userId: string): Promise<NotifyOutcome> {
  try {
    const t = await loadUser(userId);
    if (!t) return { status: "skipped", message: "사용자를 찾을 수 없습니다." };
    return await deliver("test", { ...t, enabled: true }, fillVars("signup_pending", { 이름: `${t.name}(테스트)`, 이메일: "test@example.com" }));
  } catch (err) {
    return { status: "failed", message: String(err) };
  }
}
