/* 카카오 알림톡 — 순수 규칙(DB·네트워크 없음). 단위 테스트: scripts/test_alimtalk_unit.ts
   · 알림 5종(가입대기·승인·거부·비번재설정·발행완료) 템플릿 원문(카카오 심사용) + 변수 치환
   · 휴대폰 번호 정규화(숫자만) · 서버 환경변수(옛 방식) 파싱 · 발송 모드 판정
   그릴박스 발주앱 src/lib/notify/alimtalk-core.ts 를 블로그 스튜디오 알림 5종에 맞춰 이식(2026-10-13). */

export type AlimtalkVendor = "dryrun" | "solapi" | "aligo" | "http";
export const VENDOR_LABEL: Record<AlimtalkVendor, string> = {
  dryrun: "드라이런(기록만)",
  solapi: "솔라피(SOLAPI)",
  aligo: "알리고(Aligo)",
  http: "범용 HTTP 중계",
};

/* ───────── 알림 5종 ───────── */
export const NOTIFY_EVENTS = ["signup_pending", "approved", "rejected", "password_reset", "publish_done"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export const EVENT_LABEL: Record<NotifyEvent, string> = {
  signup_pending: "새 회원가입 대기(관리자)",
  approved: "계정 승인 완료",
  rejected: "계정 승인 거부",
  password_reset: "비밀번호 재설정 안내",
  publish_done: "게시물 발행 완료",
};
/* 이력에만 쓰는 특수 이벤트(템플릿 코드는 가입대기 템플릿을 빌려 쓴다) */
export type LogEvent = NotifyEvent | "test";
export const LOG_EVENT_LABEL: Record<LogEvent, string> = { ...EVENT_LABEL, test: "테스트 발송" };

export type AlimtalkTemplate = { key: NotifyEvent; name: string; text: string; vars: readonly string[] };

/* 카카오 심사에 올리는 원문(설계서 2026-10-13 문구 그대로). 변수는 #{이름} 꼴.
   ⚠️ 심사 통과 후 글자 하나라도 바꾸면 재심사 + 발송 거부 → 여기 문구를 바꾸면 템플릿도 다시 심사받아야 한다. */
export const TEMPLATES: Record<NotifyEvent, AlimtalkTemplate> = {
  signup_pending: {
    key: "signup_pending",
    name: "블로그 스튜디오 — 새 회원가입 대기(관리자)",
    text: "[블로그 스튜디오] 새 회원가입 대기\n이름: #{이름}\n이메일: #{이메일}\n관리자 화면에서 승인해 주세요.",
    vars: ["이름", "이메일"],
  },
  approved: {
    key: "approved",
    name: "블로그 스튜디오 — 계정 승인 완료",
    text: "[블로그 스튜디오] #{이름}님, 계정이 승인되었습니다. 이제 로그인하실 수 있습니다.\n#{로그인주소}",
    vars: ["이름", "로그인주소"],
  },
  rejected: {
    key: "rejected",
    name: "블로그 스튜디오 — 계정 승인 거부",
    text: "[블로그 스튜디오] #{이름}님, 계정 승인이 거부되었습니다. 자세한 내용은 관리자에게 문의해 주세요.",
    vars: ["이름"],
  },
  password_reset: {
    key: "password_reset",
    name: "블로그 스튜디오 — 비밀번호 재설정 안내",
    text: "[블로그 스튜디오] 관리자가 비밀번호를 재설정했습니다. 관리자에게 임시 비밀번호를 받아 로그인 후 [내 계정]에서 변경해 주세요.",
    vars: [],
  },
  publish_done: {
    key: "publish_done",
    name: "블로그 스튜디오 — 게시물 발행 완료",
    text: "[블로그 스튜디오] 게시물이 발행되었습니다.\n제목: #{제목}",
    vars: ["제목"],
  },
};

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/#\{([^}]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/* 솔라피 등은 변수 키를 «#{이름}» 그대로 요구한다 */
export function varsWithBraces(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [`#{${k}}`, v]));
}

/* 템플릿이 요구하는 변수가 빠졌으면 빈 문자열로 채운다(치환 안 된 #{…} 가 업체로 나가지 않게) */
export function fillVars(event: NotifyEvent, vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEMPLATES[event].vars) out[k] = (vars[k] ?? "").toString().slice(0, 200);
  return out;
}

/* ───────── 휴대폰 번호 ─────────
   저장은 숫자만(01012345678). +82 10… 도 받아 0 으로 바꿔 준다. 알림톡은 휴대폰(01x)만 수신 가능. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("82") && d.length >= 11) d = "0" + d.slice(2);
  if (!/^01[016789]\d{7,8}$/.test(d)) return null;
  return d;
}
export function phoneLabel(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (/^0\d{9,10}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return digits;
}
/* 이력·화면용 — 가운데 가림(010-****-5678) */
export function maskPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length < 8) return "***";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

/* ───────── 서버 환경변수(옛 방식) — 값이 있으면 화면 설정보다 우선 ───────── */
export type AlimtalkEnv = {
  vendor: AlimtalkVendor;
  apiKey: string;
  apiSecret: string;
  senderKey: string; // 카카오 발신프로필 키
  senderPhone: string; // 발신번호(통신사 사전등록)
  httpUrl: string;
  httpToken: string;
  templates: Record<NotifyEvent, string>;
};
const ENV_TPL: Record<NotifyEvent, string> = {
  signup_pending: "ALIMTALK_TPL_SIGNUP_PENDING",
  approved: "ALIMTALK_TPL_APPROVED",
  rejected: "ALIMTALK_TPL_REJECTED",
  password_reset: "ALIMTALK_TPL_PASSWORD_RESET",
  publish_done: "ALIMTALK_TPL_PUBLISH_DONE",
};
export function parseAlimtalkEnv(src: Record<string, string | undefined>): AlimtalkEnv {
  const pick = (k: string) => (src[k] ?? "").trim();
  const v = pick("ALIMTALK_PROVIDER").toLowerCase();
  const vendor: AlimtalkVendor = v === "solapi" || v === "aligo" || v === "http" ? v : "dryrun";
  const templates = Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, pick(ENV_TPL[e])])) as Record<NotifyEvent, string>;
  return { vendor, apiKey: pick("ALIMTALK_API_KEY"), apiSecret: pick("ALIMTALK_API_SECRET"), senderKey: pick("ALIMTALK_SENDER_KEY"), senderPhone: pick("ALIMTALK_SENDER_PHONE"), httpUrl: pick("ALIMTALK_HTTP_URL"), httpToken: pick("ALIMTALK_HTTP_TOKEN"), templates };
}

export type SendMode = { mode: "live" } | { mode: "dryrun"; reason: string };
/* 환경변수 방식의 실발송 조건: 업체 + 그 업체 키 + 발신프로필 + 발신번호 + 템플릿 5종 전부 */
export function decideEnvSendMode(e: AlimtalkEnv): SendMode {
  if (e.vendor === "dryrun") return { mode: "dryrun", reason: "발송 업체 미설정(ALIMTALK_PROVIDER)" };
  const missing: string[] = [];
  if (e.vendor === "http") {
    if (!e.httpUrl) missing.push("ALIMTALK_HTTP_URL");
    if (!e.httpToken) missing.push("ALIMTALK_HTTP_TOKEN");
  } else {
    if (!e.apiKey) missing.push("ALIMTALK_API_KEY");
    if (!e.apiSecret) missing.push(e.vendor === "aligo" ? "ALIMTALK_API_SECRET(알리고 아이디)" : "ALIMTALK_API_SECRET");
  }
  if (!e.senderKey) missing.push("ALIMTALK_SENDER_KEY");
  if (!e.senderPhone) missing.push("ALIMTALK_SENDER_PHONE");
  for (const ev of NOTIFY_EVENTS) if (!e.templates[ev]) missing.push(ENV_TPL[ev]);
  if (missing.length) return { mode: "dryrun", reason: `빈 설정: ${missing.join(", ")}` };
  return { mode: "live" };
}

/* ───────── 발송 이력 상태 ─────────
   설계서의 dry_run|sent|failed 에 «문자 대체(sms_sent)»·«건너뜀(skipped: 수신 번호 없음·알림 끔)» 2개를 더했다.
   건너뜀을 실패로 적으면 실패 배너가 오탐하고, 드라이런으로 적으면 연동 상태를 오해하기 때문. */
export type LogStatus = "dry_run" | "sent" | "sms_sent" | "failed" | "skipped";
export const LOG_STATUS_LABEL: Record<LogStatus, string> = {
  dry_run: "드라이런(기록만)",
  sent: "알림톡 발송",
  sms_sent: "문자 대체발송",
  failed: "실패",
  skipped: "건너뜀",
};
export type StatusTone = "leaf" | "amber" | "sky" | "neutral" | "red";
export function statusTone(s: LogStatus): StatusTone {
  return s === "sent" ? "leaf" : s === "sms_sent" ? "amber" : s === "failed" ? "red" : s === "dry_run" ? "sky" : "neutral";
}
