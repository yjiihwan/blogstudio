import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { varsWithBraces, type AlimtalkEnv, type AlimtalkVendor } from "./alimtalk-core";
import { classifyVendorError, errorMessage, type SetupVendor, type TemplateState, type VendorErrorReason } from "./alimtalk-setup-core";
import { isMockKey, mockSend, mockTemplate, mockTokenResponse, mockVerify, type MockHttp } from "./alimtalk-mock";

/* 알림톡 발송·연결 확인·템플릿 조회 어댑터 — 업체별 구현을 한 꼴로 감싼다(그릴박스 발주앱 이식, 2026-10-13).
   ⚠️ 솔라피·알리고 구현은 공개 API 문서 기준이며 블로그 스튜디오 실계정으로는 검증 전. 키를 받으면 «연결 확인»·«테스트 발송»으로 확인.
   테스트서버(ALIMTALK_MOCK=1)에서 API Key 가 mock- 로 시작하면 업체를 부르지 않고 모의 응답(alimtalk-mock.ts). */

export type AlimtalkRequest = {
  to: string; // 숫자만(01012345678)
  templateCode: string;
  vars: Record<string, string>;
  text: string; // 변수가 채워진 완성 문구(알리고 message·문자 대체발송 본문)
  smsFallback: boolean;
};

export type AlimtalkResult = {
  ok: boolean;
  channel: "alimtalk" | "sms" | "none";
  providerMessageId: string | null;
  response: string;
  error: string | null;
};

export type VerifyResult = {
  ok: boolean;
  reason: VendorErrorReason | null;
  message: string;
  balanceLabel: string;
  profileFound: boolean;
  profileName: string;
  response: string;
};

export type TemplateLookup = {
  ok: boolean; // 조회 자체가 됐는지(코드가 없어도 ok=true · state=missing)
  state: TemplateState;
  name: string;
  message: string;
  reason: VendorErrorReason | null;
  response: string;
};

export interface AlimtalkProvider {
  vendor: AlimtalkVendor;
  send(req: AlimtalkRequest, env: AlimtalkEnv): Promise<AlimtalkResult>;
  verify(env: AlimtalkEnv): Promise<VerifyResult>;
  lookupTemplate(env: AlimtalkEnv, code: string): Promise<TemplateLookup>;
}

const clip = (s: string, n = 2000) => (s.length > n ? s.slice(0, n) : s);
const fail = (error: string, response = ""): AlimtalkResult => ({ ok: false, channel: "none", providerMessageId: null, response: clip(response), error: clip(error, 500) });
const digits = (s: string) => s.replace(/\D/g, "");

type Http = { status: number; text: string };
async function fetchWithTimeout(url: string, init: RequestInit, ms = 10_000): Promise<Http> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal, cache: "no-store" });
    return { status: r.status, text: await r.text() };
  } finally {
    clearTimeout(t);
  }
}
const unwrap = async (m: MockHttp): Promise<Http> => {
  if ("throw" in m) throw m.throw;
  return m;
};
const errName = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

function verifyFail(vendor: SetupVendor, status: number, body: string, err?: unknown): VerifyResult {
  const reason = classifyVendorError(vendor, status, body, err ? errName(err) : undefined);
  const detail = err ? (err instanceof Error ? err.message : String(err)) : body;
  return { ok: false, reason, message: errorMessage(reason, detail), balanceLabel: "", profileFound: false, profileName: "", response: clip(body || (err ? errName(err) : "")) };
}
function tplFail(vendor: SetupVendor, status: number, body: string, err?: unknown): TemplateLookup {
  const reason = classifyVendorError(vendor, status, body, err ? errName(err) : undefined);
  return { ok: false, state: "unknown", name: "", message: errorMessage(reason, err instanceof Error ? err.message : body), reason, response: clip(body || (err ? errName(err) : "")) };
}
const won = (n: number) => `잔액 ${n.toLocaleString("ko-KR")}원`;

function tplMessage(state: TemplateState, name: string, code: string): string {
  const n = name ? `«${name}»` : code;
  if (state === "approved") return `템플릿 ${n} 승인 확인 — 이 코드로 발송합니다.`;
  if (state === "pending") return `템플릿 ${n} 은(는) 아직 카카오 심사 중입니다. 승인되면 다시 «템플릿 확인»을 눌러 주세요(보통 1~3영업일).`;
  if (state === "rejected") return `템플릿 ${n} 이(가) 반려됐습니다. 업체 콘솔에서 반려 사유를 보고 수정 후 재심사해 주세요.`;
  return `템플릿 ${n} 상태를 알 수 없습니다. 업체 콘솔에서 확인해 주세요.`;
}

/* ── 솔라피(SOLAPI) — HMAC-SHA256 인증, 메시지 v4 ── */
function solapiAuth(env: AlimtalkEnv): string {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", env.apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${env.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
const solapiGet = (env: AlimtalkEnv, path: string) => fetchWithTimeout(`https://api.solapi.com${path}`, { method: "GET", headers: { Authorization: solapiAuth(env) } });

const solapi: AlimtalkProvider = {
  vendor: "solapi",
  async send(req, env) {
    const to = digits(req.to);
    const body = {
      messages: [
        {
          to,
          from: digits(env.senderPhone),
          text: req.text,
          type: "ATA",
          kakaoOptions: { pfId: env.senderKey, templateId: req.templateCode, variables: varsWithBraces(req.vars), disableSms: !req.smsFallback },
        },
      ],
    };
    try {
      const r = isMockKey(env.apiKey)
        ? await unwrap(mockSend("solapi", env.apiKey, to))
        : await fetchWithTimeout("https://api.solapi.com/messages/v4/send-many/detail", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: solapiAuth(env) },
            body: JSON.stringify(body),
          });
      if (r.status < 200 || r.status >= 300) return fail(`HTTP ${r.status}`, r.text);
      const j = JSON.parse(r.text) as { groupInfo?: { groupId?: string }; failedMessageList?: { statusMessage?: string }[] };
      const failed = j.failedMessageList?.[0];
      if (failed) return fail(failed.statusMessage ?? "업체가 접수를 거부", r.text);
      return { ok: true, channel: "alimtalk", providerMessageId: j.groupInfo?.groupId ?? null, response: clip(r.text), error: null };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
  async verify(env) {
    try {
      const mock = isMockKey(env.apiKey) ? mockVerify("solapi", env.apiKey, env.senderKey) : null;
      const bal = mock ? await unwrap(mock.connection) : await solapiGet(env, "/cash/v1/balance");
      if (bal.status < 200 || bal.status >= 300) return verifyFail("solapi", bal.status, bal.text);
      const bj = JSON.parse(bal.text) as { balance?: number; point?: number };
      const balanceLabel = typeof bj.balance === "number" ? won(bj.balance + (bj.point ?? 0)) : "";
      const pf = mock ? await unwrap(mock.profiles) : await solapiGet(env, "/kakao/v1/plus-friends");
      if (pf.status < 200 || pf.status >= 300) return verifyFail("solapi", pf.status, pf.text);
      const pj = JSON.parse(pf.text) as { list?: { pfId?: string; name?: string }[] } | { pfId?: string; name?: string }[];
      const list = Array.isArray(pj) ? pj : (pj.list ?? []);
      const hit = list.find((p) => p.pfId === env.senderKey);
      const names = list.map((p) => p.name ?? p.pfId ?? "").filter(Boolean);
      if (!hit)
        return { ok: true, reason: "no_profile", message: `${errorMessage("no_profile")}${names.length ? ` 이 계정의 채널: ${names.join(", ")}` : " 이 계정에 연동된 채널이 없습니다."}`, balanceLabel, profileFound: false, profileName: "", response: clip(pf.text) };
      return { ok: true, reason: null, message: `솔라피 연결 성공 — ${balanceLabel || "잔액 확인"} · 발신프로필 «${hit.name ?? hit.pfId}» 확인`, balanceLabel, profileFound: true, profileName: hit.name ?? hit.pfId ?? "", response: clip(pf.text) };
    } catch (e) {
      return verifyFail("solapi", 0, "", e);
    }
  },
  async lookupTemplate(env, code) {
    try {
      const r = isMockKey(env.apiKey) ? await unwrap(mockTemplate("solapi", code)) : await solapiGet(env, `/kakao/v1/templates/${encodeURIComponent(code)}`);
      if (r.status === 404) return { ok: true, state: "missing", name: "", message: errorMessage("no_template"), reason: "no_template", response: clip(r.text) };
      if (r.status < 200 || r.status >= 300) return tplFail("solapi", r.status, r.text);
      const j = JSON.parse(r.text) as { templateId?: string; name?: string; status?: string };
      const s = (j.status ?? "").toUpperCase();
      const state: TemplateState = s === "APPROVED" ? "approved" : s === "PENDING" || s === "INSPECTING" ? "pending" : s === "REJECTED" ? "rejected" : "unknown";
      return { ok: true, state, name: j.name ?? "", message: tplMessage(state, j.name ?? "", code), reason: null, response: clip(r.text) };
    } catch (e) {
      return tplFail("solapi", 0, "", e);
    }
  },
};

/* ── 알리고(Aligo) 카카오 알림톡 — 토큰 발급 후 호출 ── */
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded" };
async function aligoToken(env: AlimtalkEnv): Promise<{ token: string } | { fail: Http }> {
  const tk = isMockKey(env.apiKey)
    ? await unwrap(mockTokenResponse(env.apiKey))
    : await fetchWithTimeout("https://kakaoapi.aligo.in/akv10/token/create/30/s/", { method: "POST", headers: FORM_HEADERS, body: form({ apikey: env.apiKey, userid: env.apiSecret }) });
  const tj = JSON.parse(tk.text) as { code?: number; message?: string; token?: string };
  if (tj.code !== 0 || !tj.token) return { fail: tk };
  return { token: tj.token };
}
const aligoPost = (path: string, body: Record<string, string>) => fetchWithTimeout(`https://kakaoapi.aligo.in${path}`, { method: "POST", headers: FORM_HEADERS, body: form(body) });
const ALIGO_SUBJECT = "블로그 스튜디오 알림";

const aligo: AlimtalkProvider = {
  vendor: "aligo",
  async send(req, env) {
    try {
      const t = await aligoToken(env);
      if ("fail" in t) return fail(`토큰 발급 실패: ${(JSON.parse(t.fail.text) as { message?: string }).message ?? t.fail.status}`, t.fail.text);
      const to = digits(req.to);
      const r = isMockKey(env.apiKey)
        ? await unwrap(mockSend("aligo", env.apiKey, to))
        : await aligoPost("/akv10/alimtalk/send/", {
            apikey: env.apiKey,
            userid: env.apiSecret,
            token: t.token,
            senderkey: env.senderKey,
            tpl_code: req.templateCode,
            sender: digits(env.senderPhone),
            receiver_1: to,
            subject_1: ALIGO_SUBJECT,
            message_1: req.text,
            failover: req.smsFallback ? "Y" : "N",
            fsubject_1: ALIGO_SUBJECT,
            fmessage_1: req.text,
          });
      const j = JSON.parse(r.text) as { code?: number; message?: string; info?: { mid?: string | number } };
      if (j.code !== 0) return fail(j.message ?? `업체 응답 코드 ${j.code}`, r.text);
      return { ok: true, channel: "alimtalk", providerMessageId: j.info?.mid != null ? String(j.info.mid) : null, response: clip(r.text), error: null };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
  async verify(env) {
    try {
      const t = await aligoToken(env);
      if ("fail" in t) return verifyFail("aligo", t.fail.status, t.fail.text);
      const mock = isMockKey(env.apiKey) ? mockVerify("aligo", env.apiKey, env.senderKey) : null;
      const bal = mock ? await unwrap(mock.connection) : await fetchWithTimeout("https://apis.aligo.in/remain/", { method: "POST", headers: FORM_HEADERS, body: form({ key: env.apiKey, user_id: env.apiSecret }) });
      let balanceLabel = "";
      try {
        const bj = JSON.parse(bal.text) as { result_code?: number | string; SMS_CNT?: number | string };
        if (String(bj.result_code) === "1" && bj.SMS_CNT != null) balanceLabel = `잔여 문자 약 ${Number(bj.SMS_CNT).toLocaleString("ko-KR")}건`;
      } catch {
        /* 잔액은 참고값 — 못 읽어도 연결 확인은 계속 */
      }
      const pf = mock ? await unwrap(mock.profiles) : await aligoPost("/akv10/profile/list/", { apikey: env.apiKey, userid: env.apiSecret, token: t.token });
      const pj = JSON.parse(pf.text) as { code?: number; message?: string; list?: { senderKey?: string; name?: string }[] };
      if (pj.code !== 0) return verifyFail("aligo", pf.status, pf.text);
      const list = pj.list ?? [];
      const hit = list.find((p) => p.senderKey === env.senderKey);
      if (!hit)
        return { ok: true, reason: "no_profile", message: `${errorMessage("no_profile")}${list.length ? ` 이 계정의 채널: ${list.map((p) => p.name ?? p.senderKey).join(", ")}` : " 이 계정에 등록된 발신프로필이 없습니다."}`, balanceLabel, profileFound: false, profileName: "", response: clip(pf.text) };
      return { ok: true, reason: null, message: `알리고 연결 성공 — ${balanceLabel || "계정 확인"} · 발신프로필 «${hit.name ?? hit.senderKey}» 확인`, balanceLabel, profileFound: true, profileName: hit.name ?? hit.senderKey ?? "", response: clip(pf.text) };
    } catch (e) {
      return verifyFail("aligo", 0, "", e);
    }
  },
  async lookupTemplate(env, code) {
    try {
      const t = await aligoToken(env);
      if ("fail" in t) return tplFail("aligo", t.fail.status, t.fail.text);
      const r = isMockKey(env.apiKey) ? await unwrap(mockTemplate("aligo", code)) : await aligoPost("/akv10/template/list/", { apikey: env.apiKey, userid: env.apiSecret, token: t.token, senderkey: env.senderKey, tpl_code: code });
      const j = JSON.parse(r.text) as { code?: number; message?: string; list?: { templCode?: string; templName?: string; inspStatus?: string }[] };
      if (j.code !== 0) return tplFail("aligo", r.status, r.text);
      const hit = (j.list ?? []).find((x) => x.templCode === code);
      if (!hit) return { ok: true, state: "missing", name: "", message: errorMessage("no_template"), reason: "no_template", response: clip(r.text) };
      const s = (hit.inspStatus ?? "").toUpperCase();
      const state: TemplateState = s === "APR" ? "approved" : s === "REQ" || s === "REG" ? "pending" : s === "REJ" ? "rejected" : "unknown";
      return { ok: true, state, name: hit.templName ?? "", message: tplMessage(state, hit.templName ?? "", code), reason: null, response: clip(r.text) };
    } catch (e) {
      return tplFail("aligo", 0, "", e);
    }
  },
};

/* ── 범용 HTTP 중계 — JSON POST + Bearer ── */
const http: AlimtalkProvider = {
  vendor: "http",
  async send(req, env) {
    try {
      const r = await fetchWithTimeout(env.httpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.httpToken}` },
        body: JSON.stringify({ to: digits(req.to), from: digits(env.senderPhone), senderKey: env.senderKey, templateCode: req.templateCode, variables: req.vars, text: req.text, smsFallback: req.smsFallback }),
      });
      if (r.status < 200 || r.status >= 300) return fail(`HTTP ${r.status}`, r.text);
      let id: string | null = null;
      let channel: AlimtalkResult["channel"] = "alimtalk";
      try {
        const j = JSON.parse(r.text) as { id?: string; messageId?: string; channel?: string };
        id = j.id ?? j.messageId ?? null;
        if (j.channel === "sms") channel = "sms";
      } catch {
        /* 본문이 JSON 이 아니어도 2xx 면 접수로 본다 */
      }
      return { ok: true, channel, providerMessageId: id, response: clip(r.text), error: null };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
  async verify(env) {
    try {
      const u = new URL(env.httpUrl);
      u.searchParams.set("ping", "1");
      const r = await fetchWithTimeout(u.toString(), { method: "GET", headers: { Authorization: `Bearer ${env.httpToken}` } });
      if (r.status < 200 || r.status >= 300) return verifyFail("http", r.status, r.text);
      return { ok: true, reason: null, message: `중계 서버 응답 확인(HTTP ${r.status}). 발신프로필은 중계 서버 쪽 설정을 따릅니다.`, balanceLabel: "", profileFound: true, profileName: env.senderKey, response: clip(r.text) };
    } catch (e) {
      return verifyFail("http", 0, "", e);
    }
  },
  async lookupTemplate(_env, code) {
    return { ok: true, state: "unknown", name: "", message: `범용 HTTP 는 템플릿 조회가 없습니다. 코드 ${code} 를 그대로 저장합니다.`, reason: null, response: "" };
  },
};

const PROVIDERS: Record<Exclude<AlimtalkVendor, "dryrun">, AlimtalkProvider> = { solapi, aligo, http };

export function providerFor(vendor: AlimtalkVendor): AlimtalkProvider | null {
  return vendor === "dryrun" ? null : PROVIDERS[vendor];
}
