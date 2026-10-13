import { NOTIFY_EVENTS, type AlimtalkEnv, type NotifyEvent, type SendMode } from "./alimtalk-core";

/* 알림톡 «개발자 없이 셀프 연동» — 순수 규칙(DB·네트워크·crypto 없음). 단위 테스트: scripts/test_alimtalk_unit.ts
   · 업체 카탈로그(가입 링크·요금·키 찾는 경로·템플릿 등록 절차)
   · 저장 설정(암호화는 서버 모듈이)·템플릿 6종 상태·진행 상태 파싱
   · 체크리스트 4칸(업체 연결·발신프로필·템플릿 코드·테스트 발송) → 모두 녹색이면 실발송
   · 업체 오류를 한국어 원인 + 해결법으로 분류 */

export type SetupVendor = "solapi" | "aligo" | "http";
export const SETUP_VENDORS: SetupVendor[] = ["solapi", "aligo", "http"];
export function parseSetupVendor(v: unknown): SetupVendor | null {
  return v === "solapi" || v === "aligo" || v === "http" ? v : null;
}

export type FieldName = "apiKey" | "apiSecret" | "senderKey" | "senderPhone" | "httpUrl" | "httpToken";
export type FieldGuide = { name: FieldName; label: string; placeholder: string; secret: boolean; where: string[] };
export type VendorInfo = {
  label: string;
  short: string;
  signupUrl: string;
  consoleUrl: string;
  fee: string;
  blurb: string;
  advanced: boolean;
  fields: FieldGuide[];
  templateSteps: string[];
  templateLookup: boolean; // 업체 API 로 템플릿 승인 상태 조회 가능한지
};

const SENDER_PHONE: FieldGuide = {
  name: "senderPhone",
  label: "발신번호",
  placeholder: "02-1234-5678 또는 010-…",
  secret: false,
  where: ["통신사에 사전 등록된 번호여야 합니다(업체 콘솔 → 발신번호 관리 → 등록·인증).", "문자 대체발송과 알림톡 발신 표기에 쓰입니다."],
};

export const VENDOR_CATALOG: Record<SetupVendor, VendorInfo> = {
  solapi: {
    label: "솔라피(SOLAPI)",
    short: "솔라피",
    signupUrl: "https://solapi.com",
    consoleUrl: "https://console.solapi.com",
    fee: "알림톡 건당 약 8~9원 · 선불 충전 · 가입 무료",
    blurb: "API 가 깔끔하고 카카오 채널 연동이 쉬운 업체. 그릴박스 발주앱과 같은 업체를 쓰면 관리가 한 곳에서 됩니다.",
    advanced: false,
    fields: [
      { name: "apiKey", label: "API Key", placeholder: "NCS…", secret: true, where: ["솔라피 콘솔 → 오른쪽 위 프로필 → «API Key 관리» → «새 API Key 생성»", "생성 직후 Key 와 Secret 이 한 번만 보입니다. 둘 다 복사해 두세요."] },
      { name: "apiSecret", label: "API Secret", placeholder: "생성 시 함께 나온 Secret", secret: true, where: ["API Key 를 만들 때 같이 나온 긴 문자열입니다. 잃어버렸으면 Key 를 새로 만드세요.", "허용 IP 를 지정했다면 테스트서버·실서버 IP 를 모두 등록해야 합니다(비워 두면 전체 허용)."] },
      { name: "senderKey", label: "발신프로필 키(pfId)", placeholder: "KA01PF…", secret: true, where: ["솔라피 콘솔 → «카카오» → «발신프로필(채널) 연동» → 카카오 비즈니스 채널 관리자 휴대폰 인증", "연동된 채널 목록에서 «pfId»(KA01PF 로 시작) 복사"] },
      SENDER_PHONE,
    ],
    templateSteps: [
      "솔라피 콘솔 → «카카오» → «템플릿 관리» → «템플릿 등록»",
      "발신프로필(채널) 선택 → 템플릿 이름·내용에 아래 문구를 «복사» 버튼으로 그대로 붙여넣기(변수 #{…} 포함) — 6종 각각 등록",
      "«심사 요청» → 카카오 심사(보통 1~3영업일) → 승인되면 «템플릿 ID»(KA01TP 로 시작)를 복사해 아래 칸에 입력",
    ],
    templateLookup: true,
  },
  aligo: {
    label: "알리고(Aligo)",
    short: "알리고",
    signupUrl: "https://smartsms.aligo.in",
    consoleUrl: "https://smartsms.aligo.in/admin/",
    fee: "알림톡 건당 약 7~8원 · 선불 충전 · 가입 무료",
    blurb: "문자 발송 업체로 오래된 곳. 이미 알리고 문자를 쓰고 있다면 같은 계정으로 알림톡도 됩니다.",
    advanced: false,
    fields: [
      { name: "apiKey", label: "API Key", placeholder: "알리고 API Key", secret: true, where: ["알리고 관리자 → «API 연동» 메뉴 → «API Key 발급/확인»", "⚠️ 알리고는 «허용 IP» 를 반드시 등록해야 호출이 됩니다. 테스트서버·실서버 IP 를 미리 넣어 주세요."] },
      { name: "apiSecret", label: "알리고 아이디(User ID)", placeholder: "알리고 로그인 아이디", secret: false, where: ["알리고에 로그인할 때 쓰는 아이디 그대로입니다(비밀번호 아님)."] },
      { name: "senderKey", label: "발신프로필 키(senderkey)", placeholder: "40자 영숫자", secret: true, where: ["알리고 관리자 → «카카오 알림톡» → «발신프로필 관리» → 카카오 채널 등록(채널 관리자 휴대폰 인증)", "등록된 채널의 «발신프로필 키» 복사"] },
      SENDER_PHONE,
    ],
    templateSteps: [
      "알리고 관리자 → «카카오 알림톡» → «템플릿 관리» → «템플릿 등록»",
      "발신프로필 선택 → 템플릿 이름·내용에 아래 문구를 «복사» 버튼으로 그대로 붙여넣기(변수 #{…} 포함) — 6종 각각 등록",
      "«검수 요청» → 카카오 심사(보통 1~3영업일) → 승인되면 «템플릿 코드»(TP_ 또는 TR_ 로 시작)를 복사해 아래 칸에 입력",
    ],
    templateLookup: true,
  },
  http: {
    label: "범용 HTTP 중계(개발자용)",
    short: "범용 HTTP",
    signupUrl: "",
    consoleUrl: "",
    fee: "요금은 연결한 중계 서버·업체 기준",
    blurb: "다른 업체나 사내 중계 서버를 붙일 때. 개발 담당이 주소·토큰을 알려 준 경우에만 쓰세요.",
    advanced: true,
    fields: [
      { name: "httpUrl", label: "중계 서버 주소(URL)", placeholder: "https://…/send", secret: false, where: ["개발 담당에게 받은 JSON POST 주소"] },
      { name: "httpToken", label: "인증 토큰(Bearer)", placeholder: "토큰", secret: true, where: ["개발 담당에게 받은 토큰"] },
      { name: "senderKey", label: "발신프로필 키", placeholder: "중계 서버가 요구하는 값", secret: true, where: ["중계 서버 쪽 카카오 채널 키"] },
      SENDER_PHONE,
    ],
    templateSteps: ["중계 서버를 운영하는 업체 콘솔에서 아래 문구 6종으로 템플릿을 등록·심사받고 코드를 받습니다."],
    templateLookup: false,
  },
};

export function requiredFields(vendor: SetupVendor): FieldName[] {
  return VENDOR_CATALOG[vendor].fields.map((f) => f.name);
}

/* ───────── 저장되는 키 묶음(서버가 통째로 암호화 → settings.alimtalk_credentials) ───────── */
export type StoredCredentials = { apiKey: string; apiSecret: string; senderKey: string; senderPhone: string; httpUrl: string; httpToken: string; savedAt: string };
export type StoredConfig = StoredCredentials & { vendor: SetupVendor };
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseStoredCredentials(json: string | null | undefined): StoredCredentials | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    return { apiKey: str(o.apiKey), apiSecret: str(o.apiSecret), senderKey: str(o.senderKey), senderPhone: str(o.senderPhone, 20), httpUrl: str(o.httpUrl, 1000), httpToken: str(o.httpToken, 1000), savedAt: str(o.savedAt, 40) };
  } catch {
    return null;
  }
}
export function emptyCredentials(): StoredCredentials {
  return { apiKey: "", apiSecret: "", senderKey: "", senderPhone: "", httpUrl: "", httpToken: "", savedAt: "" };
}

/* ───────── 템플릿 6종 상태(평문 JSON → settings.alimtalk_templates) ───────── */
export type TemplateState = "approved" | "pending" | "rejected" | "missing" | "unknown";
export const TEMPLATE_STATE_LABEL: Record<TemplateState, string> = {
  approved: "승인됨",
  pending: "심사 중",
  rejected: "반려됨",
  missing: "없음(코드 틀림)",
  unknown: "확인 불가",
};
export type TemplateEntry = { code: string; state: TemplateState | null; name: string; checkedAt: string; fingerprint: string };
export type TemplateMap = Record<NotifyEvent, TemplateEntry>;
const EMPTY_ENTRY: TemplateEntry = { code: "", state: null, name: "", checkedAt: "", fingerprint: "" };
export function emptyTemplates(): TemplateMap {
  return Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, { ...EMPTY_ENTRY }])) as TemplateMap;
}
const parseState = (v: unknown): TemplateState | null => (v === "approved" || v === "pending" || v === "rejected" || v === "missing" || v === "unknown" ? v : null);
export function parseTemplates(json: string | null | undefined): TemplateMap {
  const out = emptyTemplates();
  if (!json) return out;
  try {
    const o = JSON.parse(json) as Record<string, Partial<TemplateEntry>>;
    for (const e of NOTIFY_EVENTS) {
      const t = o[e];
      if (!t) continue;
      out[e] = { code: str(t.code, 100), state: parseState(t.state), name: str(t.name, 200), checkedAt: str(t.checkedAt, 40), fingerprint: str(t.fingerprint, 80) };
    }
    return out;
  } catch {
    return out;
  }
}

/* 템플릿 코드 형식 — 영문·숫자·-_. 만. 빈칸은 «아직 없음» */
export function checkTemplateCode(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const c = raw.trim().slice(0, 100);
  if (!c) return { ok: true, value: "" };
  if (!/^[\w.-]+$/.test(c)) return { ok: false, message: "템플릿 코드는 영문·숫자·-_. 만 쓸 수 있습니다. 앞뒤 공백·한글이 섞이지 않았는지 확인해 주세요." };
  return { ok: true, value: c };
}

/* AlimtalkEnv 꼴로 — 발송·검증 어댑터는 이 꼴만 안다 */
export function envFromStored(c: StoredConfig, templates: TemplateMap): AlimtalkEnv {
  return {
    vendor: c.vendor,
    apiKey: c.apiKey,
    apiSecret: c.apiSecret,
    senderKey: c.senderKey,
    senderPhone: c.senderPhone,
    httpUrl: c.httpUrl,
    httpToken: c.httpToken,
    templates: Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, templates[e].code])) as Record<NotifyEvent, string>,
  };
}

/* 키 저장 — 빈 칸은 기존 값 유지(한 칸만 바꿀 수 있게). 기존 키가 있고 값이 달라지면 «덮어쓰기» */
export type KeyInput = Partial<Record<FieldName, string>>;
export type MergeResult = { ok: true; config: StoredConfig; changed: FieldName[]; overwrites: boolean } | { ok: false; message: string };

export function mergeKeys(existing: StoredConfig | null, vendor: SetupVendor, input: KeyInput, now: string): MergeResult {
  const base: StoredConfig = existing && existing.vendor === vendor ? existing : { ...emptyCredentials(), vendor };
  const next: StoredConfig = { ...base, vendor, savedAt: now };
  const changed: FieldName[] = [];
  for (const f of requiredFields(vendor)) {
    const raw = (input[f] ?? "").trim();
    if (!raw) continue;
    const v = f === "senderPhone" ? raw.replace(/[^\d]/g, "") : raw;
    if (f === "senderPhone" && !/^0\d{8,10}$/.test(v)) return { ok: false, message: "발신번호 형식이 아닙니다. 예) 02-1234-5678, 010-1234-5678" };
    if (f === "httpUrl" && !/^https?:\/\/\S+$/i.test(v)) return { ok: false, message: "중계 서버 주소는 http(s):// 로 시작해야 합니다." };
    if (v !== base[f]) changed.push(f);
    next[f] = v;
  }
  const missing = requiredFields(vendor).filter((f) => !next[f]);
  if (missing.length) {
    const labels = missing.map((m) => VENDOR_CATALOG[vendor].fields.find((x) => x.name === m)?.label ?? m);
    return { ok: false, message: `아직 비어 있는 칸: ${labels.join(", ")}` };
  }
  const hadKeys = !!existing && requiredFields(existing.vendor).some((f) => !!existing[f]);
  const overwrites = hadKeys && (existing!.vendor !== vendor || changed.length > 0);
  return { ok: true, config: next, changed, overwrites };
}

/* 화면 표시 — 끝 4자리만. 원문은 클라이언트로 내려보내지 않는다 */
export function maskTail4(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}
export function senderPhoneLabel(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (/^02\d{7,8}$/.test(d)) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  if (/^0\d{9,10}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return digits;
}
export type FieldView = { name: FieldName; label: string; masked: string; set: boolean };
export function fieldViews(c: StoredConfig): FieldView[] {
  return VENDOR_CATALOG[c.vendor].fields.map((f) => ({
    name: f.name,
    label: f.label,
    masked: !c[f.name] ? "" : f.secret ? maskTail4(c[f.name]) : f.name === "senderPhone" ? senderPhoneLabel(c[f.name]) : c[f.name],
    set: !!c[f.name],
  }));
}

/* ───────── 진행 상태(평문 JSON → settings.alimtalk_setup) ─────────
   fingerprint = 키 묶음 해시(서버가 계산). 키가 바뀌면 지난 «연결 확인»·«템플릿 확인»·«받았어요»는 무효. */
export type SetupStatus = {
  fingerprint: string;
  connected: { at: string; ok: boolean; balanceLabel: string; profileName: string; profileFound: boolean; message: string } | null;
  testReceived: { at: string; by: string; phone: string } | null;
};
export const EMPTY_STATUS: SetupStatus = { fingerprint: "", connected: null, testReceived: null };
export function parseSetupStatus(json: string | null | undefined): SetupStatus {
  if (!json) return EMPTY_STATUS;
  try {
    const o = JSON.parse(json) as Partial<SetupStatus>;
    return {
      fingerprint: str(o.fingerprint, 80),
      connected: o.connected
        ? { at: str(o.connected.at, 40), ok: o.connected.ok === true, balanceLabel: str(o.connected.balanceLabel, 60), profileName: str(o.connected.profileName, 100), profileFound: o.connected.profileFound === true, message: str(o.connected.message) }
        : null,
      testReceived: o.testReceived ? { at: str(o.testReceived.at, 40), by: str(o.testReceived.by, 60), phone: str(o.testReceived.phone, 20) } : null,
    };
  } catch {
    return EMPTY_STATUS;
  }
}

/* ───────── 체크리스트 4칸 ───────── */
export type ChecklistKey = "connected" | "profile" | "templates" | "testReceived";
export type ChecklistItem = { key: ChecklistKey; label: string; ok: boolean; detail: string };
export const CHECKLIST_LABEL: Record<ChecklistKey, string> = { connected: "업체 연결", profile: "발신프로필", templates: "템플릿 코드(6종)", testReceived: "테스트 발송" };

export type ChecklistInput = { config: StoredConfig | null; templates: TemplateMap; status: SetupStatus; fingerprint: string };

/* 템플릿 1종이 «완료»인가 — 조회 가능 업체: 현재 키로 조회해 승인됨 · 조회 불가 업체(http): 코드만 있으면 됨 */
export function templateReady(entry: TemplateEntry, lookup: boolean, fingerprint: string): boolean {
  if (!entry.code) return false;
  if (!lookup) return true;
  return entry.state === "approved" && !!fingerprint && entry.fingerprint === fingerprint;
}

export function buildChecklist(i: ChecklistInput): ChecklistItem[] {
  const c = i.config;
  const fresh = !!c && !!i.fingerprint && i.status.fingerprint === i.fingerprint;
  const conn = fresh && i.status.connected?.ok === true;
  const profile = conn && i.status.connected!.profileFound;
  const lookup = c ? VENDOR_CATALOG[c.vendor].templateLookup : true;
  const readyCount = c ? NOTIFY_EVENTS.filter((e) => templateReady(i.templates[e], lookup, i.fingerprint)).length : 0;
  const tpl = !!c && readyCount === NOTIFY_EVENTS.length;
  const test = fresh && !!i.status.testReceived;
  const vendorLabel = c ? VENDOR_CATALOG[c.vendor].short : "";
  const codeCount = NOTIFY_EVENTS.filter((e) => !!i.templates[e].code).length;
  return [
    {
      key: "connected",
      label: CHECKLIST_LABEL.connected,
      ok: conn,
      detail: !c ? "업체를 고르고 키를 넣어 주세요" : !fresh ? "키를 저장했으니 «연결 확인»을 눌러 주세요" : conn ? `${vendorLabel} 연결됨${i.status.connected!.balanceLabel ? ` · ${i.status.connected!.balanceLabel}` : ""}` : "연결 실패 — 키를 다시 확인해 주세요",
    },
    {
      key: "profile",
      label: CHECKLIST_LABEL.profile,
      ok: profile,
      detail: !c ? "키 입력 단계에서 발신프로필 키를 넣습니다" : !conn ? "업체 연결이 되면 자동으로 확인됩니다" : profile ? `${i.status.connected!.profileName || "채널"} 확인됨` : "업체 계정에 이 발신프로필 키가 없습니다",
    },
    {
      key: "templates",
      label: CHECKLIST_LABEL.templates,
      ok: tpl,
      detail: !c ? "업체 연결 뒤 6종 코드를 등록합니다" : tpl ? (lookup ? "6종 모두 승인 확인" : "6종 코드 입력됨(조회 불가 업체)") : codeCount === 0 ? "심사 통과한 템플릿 코드 6종을 입력하고 «템플릿 확인»" : `${readyCount}/${NOTIFY_EVENTS.length} 완료 · 코드 ${codeCount}/${NOTIFY_EVENTS.length} 입력`,
    },
    {
      key: "testReceived",
      label: CHECKLIST_LABEL.testReceived,
      ok: test,
      detail: test ? `${i.status.testReceived!.phone} 도착 확인(${i.status.testReceived!.by})` : "«테스트 발송» 후 휴대폰에 오면 «받았어요»",
    },
  ];
}

/* 4개 모두 녹색이면 실발송, 아니면 드라이런 + 빠진 항목 */
export function checklistMode(items: ChecklistItem[]): SendMode {
  const missing = items.filter((x) => !x.ok).map((x) => x.label);
  if (missing.length === 0) return { mode: "live" };
  return { mode: "dryrun", reason: `연동 미완료: ${missing.join(" · ")}` };
}

/* 마법사가 처음 펼칠 단계 = 첫 미완료 단계(1~5) */
export function firstOpenStep(c: StoredConfig | null, items: ChecklistItem[]): 1 | 2 | 3 | 4 | 5 {
  if (!c) return 1;
  if (requiredFields(c.vendor).some((f) => !c[f])) return 2;
  const by = Object.fromEntries(items.map((x) => [x.key, x.ok])) as Record<ChecklistKey, boolean>;
  if (!by.connected || !by.profile) return 3;
  if (!by.templates) return 4;
  return 5;
}

/* ───────── 업체 오류 → 한국어 원인 + 해결법 ───────── */
export type VendorErrorReason = "bad_key" | "ip_blocked" | "no_profile" | "no_template" | "timeout" | "network" | "unknown";
export const REASON_LABEL: Record<VendorErrorReason, string> = {
  bad_key: "키가 틀렸습니다",
  ip_blocked: "서버 IP 가 업체에 등록되지 않았습니다",
  no_profile: "발신프로필(채널)을 찾을 수 없습니다",
  no_template: "템플릿 코드를 찾을 수 없습니다",
  timeout: "업체가 응답하지 않습니다(시간 초과)",
  network: "업체에 연결할 수 없습니다",
  unknown: "업체가 오류를 돌려줬습니다",
};
export const REASON_HINT: Record<VendorErrorReason, string> = {
  bad_key: "API Key·Secret(알리고는 아이디)을 업체 콘솔에서 다시 복사해 넣어 주세요. 앞뒤 공백·줄바꿈이 섞이기 쉽습니다.",
  ip_blocked: "업체 콘솔 «허용 IP» 에 이 서버 IP 를 추가해 주세요(개발 담당에게 서버 IP 를 물어보세요). 솔라피는 비워 두면 전체 허용입니다.",
  no_profile: "발신프로필 키가 이 업체 계정의 채널 키와 다릅니다. 업체 콘솔 «발신프로필(채널)» 에서 키를 다시 복사하세요.",
  no_template: "템플릿 코드를 다시 확인하세요. 심사 «승인» 뒤에 나오는 코드여야 합니다.",
  timeout: "잠시 뒤 다시 눌러 보세요. 계속되면 업체 장애 공지를 확인하세요.",
  network: "서버에서 업체 주소로 나갈 수 없습니다. 주소 오타(범용 HTTP)·업체 장애를 확인하세요.",
  unknown: "아래 업체 응답 원문을 개발 담당에게 전달해 주세요.",
};

export function classifyVendorError(vendor: SetupVendor, httpStatus: number, body: string, errName?: string): VendorErrorReason {
  if (errName === "AbortError" || errName === "TimeoutError" || /abort|timeout/i.test(errName ?? "")) return "timeout";
  if (errName && /fetch failed|ENOTFOUND|ECONN|network/i.test(errName + body)) return "network";
  const b = body.toLowerCase();
  if (vendor === "solapi") {
    if (httpStatus === 401 || /invalidapikey|signaturedoesnotmatch|unauthorized|invalid.*key|apikey/.test(b)) return "bad_key";
    if (httpStatus === 403 || /ip|accessdenied|access denied|allowed/.test(b)) return "ip_blocked";
    if (/pfid|plus.?friend|발신프로필|채널/.test(b)) return "no_profile";
    if (httpStatus === 404 || /template/.test(b)) return "no_template";
    return "unknown";
  }
  if (vendor === "aligo") {
    if (/ip/.test(b)) return "ip_blocked";
    if (/인증|apikey|userid|api key|key/.test(b)) return "bad_key";
    if (/senderkey|프로필|채널/.test(b)) return "no_profile";
    if (/템플릿|template|tpl/.test(b)) return "no_template";
    return "unknown";
  }
  if (httpStatus === 401 || httpStatus === 403) return "bad_key";
  if (httpStatus === 404) return "network";
  return "unknown";
}

export function errorMessage(reason: VendorErrorReason, detail?: string): string {
  const d = (detail ?? "").trim().slice(0, 200);
  return `${REASON_LABEL[reason]}. ${REASON_HINT[reason]}${d ? ` (업체 응답: ${d})` : ""}`;
}

/* ───────── 실패 누적 배너: 24시간 내 실패 3건 이상 ───────── */
export const FAILURE_BANNER_THRESHOLD = 3;
export function failureBannerNeeded(failed24h: number): boolean {
  return failed24h >= FAILURE_BANNER_THRESHOLD;
}
