import "server-only";
import { createHash } from "node:crypto";
import { db, schema } from "@/db/client";
import { desc, eq, gte, sql } from "drizzle-orm";
import { decryptApiKey, tryEncryptApiKey } from "@/lib/crypto";
import { NOTIFY_EVENTS, TEMPLATES, decideEnvSendMode, parseAlimtalkEnv, type AlimtalkEnv, type LogEvent, type LogStatus, type NotifyEvent, type SendMode } from "./alimtalk-core";
import {
  EMPTY_STATUS,
  VENDOR_CATALOG,
  buildChecklist,
  checkTemplateCode,
  checklistMode,
  emptyCredentials,
  emptyTemplates,
  envFromStored,
  failureBannerNeeded,
  fieldViews,
  firstOpenStep,
  mergeKeys,
  parseSetupStatus,
  parseSetupVendor,
  parseStoredCredentials,
  parseTemplates,
  templateReady,
  type ChecklistItem,
  type FieldView,
  type KeyInput,
  type SetupStatus,
  type SetupVendor,
  type StoredConfig,
  type TemplateMap,
  type TemplateState,
} from "./alimtalk-setup-core";
import { providerFor, type TemplateLookup, type VerifyResult } from "./alimtalk";
import { mockEnabled } from "./alimtalk-mock";

/* 알림톡 연동 설정 저장소 — settings 테이블(key/valueJson) 5개 키(설계서 2026-10-13)
   · alimtalk_provider      solapi|aligo|http
   · alimtalk_credentials   키 묶음 JSON 을 crypto.ts encryptApiKey(AES-256-GCM, ENCRYPTION_KEY)로 통째 암호화
   · alimtalk_templates     알림 6종 템플릿 코드·확인 상태(평문, 비밀 없음)
   · alimtalk_setup         연결 확인·테스트 도착 확인(평문)
   · alimtalk_fallback_sms  실패 시 문자 대체발송(기본 true)
   서버 환경변수 ALIMTALK_PROVIDER 가 있으면 «서버 설정이 우선»(그릴박스와 동일 호환). */

export const KEY_PROVIDER = "alimtalk_provider";
export const KEY_CREDENTIALS = "alimtalk_credentials";
export const KEY_TEMPLATES = "alimtalk_templates";
export const KEY_SETUP = "alimtalk_setup";
export const KEY_FALLBACK_SMS = "alimtalk_fallback_sms";

async function getSettingRaw(key: string): Promise<unknown> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  if (!row) return null;
  try {
    return JSON.parse(row.valueJson);
  } catch {
    return null;
  }
}
async function setSettingRaw(key: string, value: unknown): Promise<void> {
  const valueJson = JSON.stringify(value);
  const now = new Date().toISOString();
  await db.insert(schema.settings).values({ key, valueJson, updatedAt: now }).onConflictDoUpdate({ target: schema.settings.key, set: { valueJson, updatedAt: now } });
}
const asString = (v: unknown) => (typeof v === "string" ? v : null);

export async function getStoredConfig(): Promise<StoredConfig | null> {
  const vendor = parseSetupVendor(await getSettingRaw(KEY_PROVIDER));
  if (!vendor) return null;
  const sealed = asString(await getSettingRaw(KEY_CREDENTIALS));
  let creds = emptyCredentials();
  if (sealed) {
    try {
      creds = parseStoredCredentials(decryptApiKey(sealed)) ?? emptyCredentials();
    } catch (err) {
      console.error("[alimtalk] credentials decrypt failed (ENCRYPTION_KEY 변경?):", String(err));
    }
  }
  return { ...creds, vendor };
}
async function saveStoredConfig(c: StoredConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const { vendor, ...creds } = c;
  const enc = tryEncryptApiKey(JSON.stringify(creds));
  if (!enc.ok) return { ok: false, error: enc.error };
  await setSettingRaw(KEY_PROVIDER, vendor);
  await setSettingRaw(KEY_CREDENTIALS, enc.value);
  return { ok: true };
}
export async function getTemplates(): Promise<TemplateMap> {
  const raw = await getSettingRaw(KEY_TEMPLATES);
  return parseTemplates(raw == null ? null : JSON.stringify(raw));
}
async function saveTemplates(t: TemplateMap) {
  await setSettingRaw(KEY_TEMPLATES, t);
}
export async function getSetupStatus(): Promise<SetupStatus> {
  const raw = await getSettingRaw(KEY_SETUP);
  return parseSetupStatus(raw == null ? null : JSON.stringify(raw));
}
async function saveSetupStatus(s: SetupStatus) {
  await setSettingRaw(KEY_SETUP, s);
}
export async function getSmsFallback(): Promise<boolean> {
  const v = await getSettingRaw(KEY_FALLBACK_SMS);
  return v === null || v === undefined ? true : v === true;
}
export async function setSmsFallback(on: boolean) {
  await setSettingRaw(KEY_FALLBACK_SMS, on);
}

/* 키 묶음 해시 — 키가 하나라도 바뀌면 지난 확인이 무효가 되도록 */
export function fingerprintOf(c: StoredConfig | null): string {
  if (!c) return "";
  return createHash("sha256").update([c.vendor, c.apiKey, c.apiSecret, c.senderKey, c.senderPhone, c.httpUrl, c.httpToken].join("\u0000")).digest("hex").slice(0, 32);
}

/* ───────── 지금 실제로 쓰일 설정 ───────── */
export type ResolvedAlimtalk = {
  env: AlimtalkEnv;
  source: "env" | "db" | "none";
  mode: SendMode;
  testMode: SendMode; // «테스트 발송»은 1~4단계만 끝나면 실제로 보낸다(«받았어요» 전이라도)
  checklist: ChecklistItem[];
  smsFallback: boolean;
};

export async function resolveAlimtalk(): Promise<ResolvedAlimtalk> {
  const fromEnv = parseAlimtalkEnv(process.env);
  const smsFallback = await getSmsFallback();
  if (fromEnv.vendor !== "dryrun") {
    const m = decideEnvSendMode(fromEnv);
    const ok = m.mode === "live";
    const tplOk = NOTIFY_EVENTS.every((e) => !!fromEnv.templates[e]);
    return {
      env: fromEnv,
      source: "env",
      mode: m,
      testMode: m,
      smsFallback,
      checklist: [
        { key: "connected", label: "업체 연결", ok: !!fromEnv.apiKey || !!fromEnv.httpUrl, detail: "서버 설정(환경변수)" },
        { key: "profile", label: "발신프로필", ok: !!fromEnv.senderKey, detail: "서버 설정(환경변수)" },
        { key: "templates", label: "템플릿 코드(6종)", ok: tplOk, detail: "서버 설정(환경변수)" },
        { key: "testReceived", label: "테스트 발송", ok, detail: ok ? "서버 설정으로 실발송" : "서버 설정이 덜 채워짐" },
      ],
    };
  }
  const [config, templates, status] = await Promise.all([getStoredConfig(), getTemplates(), getSetupStatus()]);
  const checklist = buildChecklist({ config, templates, status, fingerprint: fingerprintOf(config) });
  if (!config) {
    const none: SendMode = { mode: "dryrun", reason: "알림톡 업체 미연동 — 설정 화면의 «알림 채널(카카오 알림톡)» 마법사를 따라 주세요" };
    return { env: fromEnv, source: "none", mode: none, testMode: none, checklist, smsFallback };
  }
  return { env: envFromStored(config, templates), source: "db", mode: checklistMode(checklist), testMode: checklistMode(checklist.filter((x) => x.key !== "testReceived")), checklist, smsFallback };
}

/* ───────── 마법사 동작 ───────── */
export type SetupResult = { ok: boolean; message: string; tone?: "warn" };

export async function selectVendorStored(vendor: SetupVendor): Promise<SetupResult> {
  const existing = await getStoredConfig();
  if (existing && existing.vendor === vendor) return { ok: true, message: "이미 선택된 업체입니다. 다음 단계에서 키를 입력해 주세요." };
  /* 업체가 바뀌면 옛 키·확인 결과·템플릿 상태는 버린다(다른 업체 키가 섞이는 사고 방지) */
  const r = await saveStoredConfig({ ...emptyCredentials(), vendor, savedAt: new Date().toISOString() });
  if (!r.ok) return { ok: false, message: r.error };
  await saveSetupStatus(EMPTY_STATUS);
  await saveTemplates(emptyTemplates());
  return { ok: true, message: existing ? "업체를 바꿨습니다. 이전 키·확인 결과·템플릿 코드는 지웠으니 새로 입력해 주세요." : "업체를 골랐습니다. 다음 단계에서 키를 입력해 주세요." };
}

export async function saveKeysStored(vendor: SetupVendor, input: KeyInput, confirmed: boolean): Promise<SetupResult & { needsConfirm?: boolean }> {
  const existing = await getStoredConfig();
  const r = mergeKeys(existing, vendor, input, new Date().toISOString());
  if (!r.ok) return { ok: false, message: r.message };
  if (r.overwrites && !confirmed) return { ok: false, needsConfirm: true, message: "이미 저장된 키가 있습니다. 덮어쓰려면 확인 창에서 «덮어쓰기»를 눌러 주세요." };
  const s = await saveStoredConfig(r.config);
  if (!s.ok) return { ok: false, message: s.error };
  if (r.changed.length > 0 || r.overwrites) await saveSetupStatus(EMPTY_STATUS); // 키가 바뀌면 지난 확인은 무효
  return { ok: true, message: r.changed.length ? "키를 암호화해 저장했습니다. 이제 «연결 확인»을 눌러 업체와 통하는지 확인해 주세요." : "바뀐 값이 없어 그대로 두었습니다." };
}

export async function verifyConnectionStored(): Promise<SetupResult & { result?: VerifyResult }> {
  const config = await getStoredConfig();
  if (!config) return { ok: false, message: "먼저 업체를 고르고 키를 저장해 주세요." };
  const templates = await getTemplates();
  const result = await providerFor(config.vendor)!.verify(envFromStored(config, templates));
  const prev = await getSetupStatus();
  const fp = fingerprintOf(config);
  await saveSetupStatus({
    fingerprint: fp,
    connected: { at: new Date().toISOString(), ok: result.ok, balanceLabel: result.balanceLabel, profileName: result.profileName, profileFound: result.profileFound, message: result.message },
    testReceived: prev.fingerprint === fp ? prev.testReceived : null,
  });
  if (!result.ok) return { ok: false, message: result.message, result };
  if (!result.profileFound) return { ok: false, tone: "warn", message: result.message, result };
  return { ok: true, message: result.message, result };
}

/* 템플릿 6종 코드 저장 + 업체 조회(가능한 업체만). 빈칸은 «아직 없음»(그 종류는 미완료) */
export type TemplateCheck = { event: NotifyEvent; code: string; state: TemplateState | null; message: string };
export async function saveTemplatesStored(codes: Partial<Record<NotifyEvent, string>>): Promise<SetupResult & { checks?: TemplateCheck[] }> {
  const config = await getStoredConfig();
  if (!config) return { ok: false, message: "먼저 업체를 고르고 키를 저장해 주세요(1~2단계)." };
  const status = await getSetupStatus();
  const fp = fingerprintOf(config);
  const lookup = VENDOR_CATALOG[config.vendor].templateLookup;
  if (lookup && (status.fingerprint !== fp || !status.connected?.ok)) return { ok: false, message: "«연결 확인»을 먼저 통과해야 템플릿을 조회할 수 있습니다(3단계)." };
  const templates = await getTemplates();
  const checks: TemplateCheck[] = [];
  const provider = providerFor(config.vendor)!;
  const env = envFromStored(config, templates);
  for (const e of NOTIFY_EVENTS) {
    const c = checkTemplateCode(codes[e] ?? templates[e].code);
    if (!c.ok) return { ok: false, message: `${TEMPLATES[e].name}: ${c.message}` };
    if (!c.value) {
      templates[e] = { code: "", state: null, name: "", checkedAt: "", fingerprint: "" };
      checks.push({ event: e, code: "", state: null, message: "코드 없음 — 아직 미완료" });
      continue;
    }
    if (!lookup) {
      templates[e] = { code: c.value, state: "unknown", name: "", checkedAt: new Date().toISOString(), fingerprint: fp };
      checks.push({ event: e, code: c.value, state: "unknown", message: "저장(조회 불가 업체)" });
      continue;
    }
    const r: TemplateLookup = await provider.lookupTemplate(env, c.value);
    templates[e] = { code: c.value, state: r.ok ? r.state : "unknown", name: r.name, checkedAt: new Date().toISOString(), fingerprint: fp };
    checks.push({ event: e, code: c.value, state: templates[e].state, message: r.message });
  }
  await saveTemplates(templates);
  const ready = NOTIFY_EVENTS.filter((e) => templateReady(templates[e], lookup, fp)).length;
  const all = ready === NOTIFY_EVENTS.length;
  return { ok: all, tone: all ? undefined : "warn", message: all ? "템플릿 6종 모두 확인했습니다. 이제 «테스트 발송»으로 넘어가세요." : `템플릿 ${ready}/5 완료. 나머지는 코드를 넣거나 심사 승인 뒤 다시 «템플릿 확인»을 눌러 주세요.`, checks };
}

export async function confirmTestReceivedStored(phone: string, by: string): Promise<SetupResult> {
  const config = await getStoredConfig();
  if (!config) return { ok: false, message: "먼저 업체를 연동해 주세요." };
  const status = await getSetupStatus();
  const fp = fingerprintOf(config);
  if (status.fingerprint !== fp || !status.connected?.ok) return { ok: false, message: "«연결 확인»을 먼저 통과해 주세요." };
  await saveSetupStatus({ ...status, testReceived: { at: new Date().toISOString(), by, phone } });
  return { ok: true, message: "테스트 도착을 확인했습니다. 체크리스트 4개가 모두 녹색이면 이제부터 실제로 발송됩니다." };
}

export async function resetAlimtalkStored(): Promise<SetupResult> {
  const existing = await getStoredConfig();
  if (!existing) return { ok: true, message: "지울 설정이 없습니다." };
  await setSettingRaw(KEY_PROVIDER, null);
  await setSettingRaw(KEY_CREDENTIALS, null);
  await saveSetupStatus(EMPTY_STATUS);
  await saveTemplates(emptyTemplates());
  return { ok: true, message: "알림톡 연동을 초기화했습니다. 드라이런으로 돌아갑니다." };
}

/* ───────── 발송 이력 ───────── */
export type LogInput = { userId: string | null; event: LogEvent; to: string; templateCode: string; status: LogStatus; providerMessageId?: string | null; error?: string | null };
export async function appendLog(l: LogInput): Promise<void> {
  await db.insert(schema.alimtalkLogs).values({ userId: l.userId, event: l.event, to: l.to, templateCode: l.templateCode, status: l.status, providerMessageId: l.providerMessageId ?? null, error: l.error ? l.error.slice(0, 500) : null });
}
export type LogRow = { id: string; userId: string | null; userName: string; event: LogEvent; to: string; templateCode: string; status: LogStatus; providerMessageId: string | null; error: string | null; createdAt: string };
export async function recentLogs(limit = 100): Promise<LogRow[]> {
  const rows = await db
    .select({ id: schema.alimtalkLogs.id, userId: schema.alimtalkLogs.userId, userName: schema.users.name, event: schema.alimtalkLogs.event, to: schema.alimtalkLogs.to, templateCode: schema.alimtalkLogs.templateCode, status: schema.alimtalkLogs.status, providerMessageId: schema.alimtalkLogs.providerMessageId, error: schema.alimtalkLogs.error, createdAt: schema.alimtalkLogs.createdAt })
    .from(schema.alimtalkLogs)
    .leftJoin(schema.users, eq(schema.users.id, schema.alimtalkLogs.userId))
    .orderBy(desc(schema.alimtalkLogs.createdAt), desc(schema.alimtalkLogs.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, userName: r.userName ?? "", event: r.event as LogEvent }));
}
/* SQLite CURRENT_TIMESTAMP 는 "YYYY-MM-DD HH:MM:SS"(UTC) — 같은 꼴로 비교 */
export async function countFailed24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.alimtalkLogs).where(sql`${schema.alimtalkLogs.status} = 'failed' AND ${schema.alimtalkLogs.createdAt} >= ${since}`);
  return Number(row?.n ?? 0);
}
export async function latestTestLog(userId: string): Promise<LogRow | null> {
  const rows = await recentLogs(100);
  return rows.find((r) => r.event === "test" && r.userId === userId) ?? null;
}
export async function clearLogsForTest(): Promise<number> {
  const rows = await db.delete(schema.alimtalkLogs).returning({ id: schema.alimtalkLogs.id });
  return rows.length;
}

/* ───────── 화면용(비밀 없음) ───────── */
export type TemplateView = { event: NotifyEvent; name: string; text: string; code: string; state: TemplateState | null; checkedAt: string; ready: boolean };
export type SetupView = {
  source: "env" | "db" | "none";
  mockEnabled: boolean;
  vendor: SetupVendor | null;
  fields: FieldView[];
  hasKeys: boolean;
  savedAt: string;
  status: SetupStatus;
  templates: TemplateView[];
  checklist: ChecklistItem[];
  mode: SendMode;
  testMode: SendMode;
  openStep: 1 | 2 | 3 | 4 | 5;
  smsFallback: boolean;
  failed24h: number;
  failureBanner: boolean;
};

export async function getSetupView(): Promise<SetupView> {
  const [resolved, config, templates, status, failed24h] = await Promise.all([resolveAlimtalk(), getStoredConfig(), getTemplates(), getSetupStatus(), countFailed24h()]);
  const fp = fingerprintOf(config);
  const lookup = config ? VENDOR_CATALOG[config.vendor].templateLookup : true;
  return {
    source: resolved.source,
    mockEnabled: mockEnabled(),
    vendor: config?.vendor ?? null,
    fields: config ? fieldViews(config) : [],
    hasKeys: !!config && (!!config.apiKey || !!config.httpUrl),
    savedAt: config?.savedAt ?? "",
    status,
    templates: NOTIFY_EVENTS.map((e) => ({ event: e, name: TEMPLATES[e].name, text: TEMPLATES[e].text, code: resolved.source === "env" ? resolved.env.templates[e] : templates[e].code, state: templates[e].state, checkedAt: templates[e].checkedAt, ready: resolved.source === "env" ? !!resolved.env.templates[e] : templateReady(templates[e], lookup, fp) })),
    checklist: resolved.checklist,
    mode: resolved.mode,
    testMode: resolved.testMode,
    openStep: firstOpenStep(config, resolved.checklist),
    smsFallback: resolved.smsFallback,
    failed24h,
    failureBanner: failureBannerNeeded(failed24h),
  };
}
