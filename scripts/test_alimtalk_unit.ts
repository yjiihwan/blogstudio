/* 카카오 알림톡 전환 — 순수 규칙 단위 테스트(DB·네트워크 없음)
   실행: npx tsx scripts/test_alimtalk_unit.ts */
import { NOTIFY_EVENTS, TEMPLATES, decideEnvSendMode, fillVars, maskPhone, normalizePhone, parseAlimtalkEnv, phoneLabel, renderTemplate, statusTone, varsWithBraces } from "../src/lib/notify/alimtalk-core";
import {
  EMPTY_STATUS,
  VENDOR_CATALOG,
  buildChecklist,
  checkTemplateCode,
  checklistMode,
  classifyVendorError,
  emptyCredentials,
  emptyTemplates,
  envFromStored,
  errorMessage,
  failureBannerNeeded,
  fieldViews,
  firstOpenStep,
  maskTail4,
  mergeKeys,
  parseSetupStatus,
  parseStoredCredentials,
  parseTemplates,
  templateReady,
  type SetupStatus,
  type StoredConfig,
  type TemplateMap,
} from "../src/lib/notify/alimtalk-setup-core";

let pass = 0;
let fail = 0;
function eq<T>(name: string, got: T, want: T) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.log(`✗ ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
  }
}
const ok = (name: string, cond: boolean) => eq(name, cond, true);

/* ── 템플릿 6종 ── */
eq("템플릿 6종 키", Object.keys(TEMPLATES).sort(), [...NOTIFY_EVENTS].sort());
for (const e of NOTIFY_EVENTS) {
  const t = TEMPLATES[e];
  const inText = [...t.text.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]).sort();
  eq(`템플릿 ${e} 변수 선언 = 본문 변수`, inText, [...t.vars].sort());
  ok(`템플릿 ${e} 머리말`, t.text.startsWith("[블로그 스튜디오]"));
}
eq("치환", renderTemplate(TEMPLATES.approved.text, { 이름: "김철수", 로그인주소: "https://x/login" }), "[블로그 스튜디오] 김철수님, 계정이 승인되었습니다. 이제 로그인하실 수 있습니다.\nhttps://x/login");
eq("없는 변수는 그대로", renderTemplate("#{이름} #{없음}", { 이름: "A" }), "A #{없음}");
eq("fillVars 빠진 변수는 빈칸", fillVars("signup_pending", { 이름: "홍" }), { 이름: "홍", 이메일: "" });
eq("fillVars 여분 변수 제거", Object.keys(fillVars("publish_done", { 제목: "t", 이름: "x" })), ["제목"]);
eq("varsWithBraces", varsWithBraces({ 이름: "A" }), { "#{이름}": "A" });

/* ── 휴대폰 ── */
eq("정규화 하이픈", normalizePhone("010-1234-5678"), "01012345678");
eq("정규화 공백", normalizePhone(" 010 1234 5678 "), "01012345678");
eq("정규화 +82", normalizePhone("+82 10-1234-5678"), "01012345678");
eq("정규화 10자리(011)", normalizePhone("011-123-4567"), "0111234567");
eq("일반전화 거부", normalizePhone("02-1234-5678"), null);
eq("짧은 번호 거부", normalizePhone("0101234"), null);
eq("빈값 거부", normalizePhone(""), null);
eq("표기", phoneLabel("01012345678"), "010-1234-5678");
eq("가림", maskPhone("01012345678"), "010-****-5678");

/* ── 환경변수 방식 ── */
const envNone = parseAlimtalkEnv({});
eq("env 미설정 → dryrun", envNone.vendor, "dryrun");
eq("env 모드 사유", decideEnvSendMode(envNone).mode, "dryrun");
const envFull = parseAlimtalkEnv({ ALIMTALK_PROVIDER: "solapi", ALIMTALK_API_KEY: "k", ALIMTALK_API_SECRET: "s", ALIMTALK_SENDER_KEY: "pf", ALIMTALK_SENDER_PHONE: "0212345678", ALIMTALK_TPL_SIGNUP_PENDING: "a", ALIMTALK_TPL_APPROVED: "b", ALIMTALK_TPL_REJECTED: "c", ALIMTALK_TPL_PASSWORD_RESET: "d", ALIMTALK_TPL_PUBLISH_DONE: "e", ALIMTALK_TPL_IMPROVEMENT_PROPOSAL: "f" });
eq("env 전부 → live", decideEnvSendMode(envFull), { mode: "live" });
const envPartial = parseAlimtalkEnv({ ALIMTALK_PROVIDER: "solapi", ALIMTALK_API_KEY: "k", ALIMTALK_API_SECRET: "s", ALIMTALK_SENDER_KEY: "pf", ALIMTALK_SENDER_PHONE: "02", ALIMTALK_TPL_APPROVED: "b" });
const pm = decideEnvSendMode(envPartial);
ok("env 템플릿 빠지면 dryrun + 이름 표시", pm.mode === "dryrun" && pm.reason.includes("ALIMTALK_TPL_SIGNUP_PENDING") && !pm.reason.includes("ALIMTALK_TPL_APPROVED"));

/* ── 상태 톤 ── */
eq("톤", [statusTone("sent"), statusTone("failed"), statusTone("dry_run"), statusTone("skipped"), statusTone("sms_sent")], ["leaf", "red", "sky", "neutral", "amber"]);

/* ── 저장 설정·키 병합 ── */
eq("credentials 파싱 null", parseStoredCredentials(null), null);
eq("credentials 파싱 깨진 JSON", parseStoredCredentials("{"), null);
const m1 = mergeKeys(null, "solapi", { apiKey: "NCS1234567", apiSecret: "sec", senderKey: "KA01PF1", senderPhone: "02-1234-5678" }, "T1");
ok("첫 저장 ok", m1.ok);
if (m1.ok) {
  eq("발신번호 숫자만", m1.config.senderPhone, "0212345678");
  eq("바뀐 칸 4", m1.changed.length, 4);
  eq("덮어쓰기 아님", m1.overwrites, false);
  const m2 = mergeKeys(m1.config, "solapi", { apiKey: "", apiSecret: "", senderKey: "", senderPhone: "" }, "T2");
  ok("빈칸 = 기존 유지", m2.ok && m2.changed.length === 0 && m2.overwrites === false && m2.config.apiKey === "NCS1234567");
  const m3 = mergeKeys(m1.config, "solapi", { apiKey: "NCS9999" }, "T3");
  ok("한 칸 변경 = 덮어쓰기", m3.ok && m3.changed.join() === "apiKey" && m3.overwrites === true);
  const m4 = mergeKeys(m1.config, "aligo", { apiKey: "a", apiSecret: "id", senderKey: "k", senderPhone: "01012345678" }, "T4");
  ok("업체 바꾸면 덮어쓰기", m4.ok && m4.overwrites === true);
  eq("마스킹", fieldViews(m1.config).map((f) => f.masked), ["••••4567", "••••", "••••1PF1", "02-1234-5678"]);
}
ok("필수칸 누락 메시지", !mergeKeys(null, "solapi", { apiKey: "a" }, "T").ok);
ok("발신번호 형식", !mergeKeys(null, "solapi", { apiKey: "a", apiSecret: "b", senderKey: "c", senderPhone: "123" }, "T").ok);
ok("http URL 형식", !mergeKeys(null, "http", { httpUrl: "ftp://x", httpToken: "t", senderKey: "k", senderPhone: "0212345678" }, "T").ok);
eq("maskTail4", [maskTail4(""), maskTail4("abc"), maskTail4("abcdefgh")], ["", "••••", "••••efgh"]);

/* ── 템플릿 코드 ── */
eq("코드 빈칸 허용", checkTemplateCode("  "), { ok: true, value: "" });
eq("코드 trim", checkTemplateCode(" KA01TP_ab-1.2 "), { ok: true, value: "KA01TP_ab-1.2" });
ok("코드 한글 거부", !checkTemplateCode("템플릿").ok);
const tp = parseTemplates(JSON.stringify({ approved: { code: "TPL-OK", state: "approved", fingerprint: "fp", checkedAt: "t" }, bogus: { code: "x" } }));
eq("templates 파싱 — 6종 전부 존재", Object.keys(tp).sort(), [...NOTIFY_EVENTS].sort());
eq("templates 파싱 값", tp.approved.code, "TPL-OK");
eq("templates 미지정은 빈칸", tp.rejected.code, "");
ok("templateReady 승인+같은 fp", templateReady(tp.approved, true, "fp"));
ok("templateReady 키 바뀌면 무효", !templateReady(tp.approved, true, "fp2"));
ok("templateReady http 는 코드만", templateReady({ code: "X", state: null, name: "", checkedAt: "", fingerprint: "" }, false, "any"));
ok("templateReady 코드 없음", !templateReady(tp.rejected, false, "fp"));

/* ── 체크리스트 ── */
const cfg: StoredConfig = { ...emptyCredentials(), vendor: "solapi", apiKey: "mock-ok", apiSecret: "s", senderKey: "mock-pf-blogstudio", senderPhone: "0212345678", savedAt: "T" };
const FP = "fp1";
const allTpl = (): TemplateMap => Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, { code: "TPL-OK", state: "approved", name: "", checkedAt: "t", fingerprint: FP }])) as TemplateMap;
const connectedOk: SetupStatus = { fingerprint: FP, connected: { at: "t", ok: true, balanceLabel: "잔액 12,340원", profileName: "블로그 스튜디오", profileFound: true, message: "ok" }, testReceived: null };

const c0 = buildChecklist({ config: null, templates: emptyTemplates(), status: EMPTY_STATUS, fingerprint: "" });
eq("설정 없음 → 전부 미완", c0.map((x) => x.ok), [false, false, false, false]);
eq("설정 없음 → 1단계", firstOpenStep(null, c0), 1);
const c1 = buildChecklist({ config: cfg, templates: emptyTemplates(), status: EMPTY_STATUS, fingerprint: FP });
eq("키만 저장 → 연결 미확인", c1.map((x) => x.ok), [false, false, false, false]);
eq("키만 저장 → 3단계", firstOpenStep(cfg, c1), 3);
const c2 = buildChecklist({ config: cfg, templates: emptyTemplates(), status: connectedOk, fingerprint: FP });
eq("연결+프로필 ok", c2.map((x) => x.ok), [true, true, false, false]);
eq("→ 4단계", firstOpenStep(cfg, c2), 4);
const partialTpl = allTpl();
partialTpl.publish_done = { code: "TPL-PENDING", state: "pending", name: "", checkedAt: "t", fingerprint: FP };
const c3 = buildChecklist({ config: cfg, templates: partialTpl, status: connectedOk, fingerprint: FP });
eq("템플릿 5/6 → 미완", c3[2].ok, false);
ok("템플릿 detail 5/6", c3[2].detail.includes("5/6"));
const c4 = buildChecklist({ config: cfg, templates: allTpl(), status: connectedOk, fingerprint: FP });
eq("템플릿 6/6 → 완료", c4.map((x) => x.ok), [true, true, true, false]);
eq("→ 5단계", firstOpenStep(cfg, c4), 5);
eq("테스트 전 → dryrun 사유", checklistMode(c4), { mode: "dryrun", reason: "연동 미완료: 테스트 발송" });
eq("테스트 발송용 모드(테스트 칸 제외) → live", checklistMode(c4.filter((x) => x.key !== "testReceived")), { mode: "live" });
const c5 = buildChecklist({ config: cfg, templates: allTpl(), status: { ...connectedOk, testReceived: { at: "t", by: "관리자", phone: "010-****-0001" } }, fingerprint: FP });
eq("4개 전부 → live", checklistMode(c5), { mode: "live" });
const c6 = buildChecklist({ config: cfg, templates: allTpl(), status: { ...connectedOk, testReceived: { at: "t", by: "a", phone: "p" } }, fingerprint: "fp-changed" });
eq("키 바뀜(fp 불일치) → 전부 무효", c6.map((x) => x.ok), [false, false, false, false]);
const noProfile: SetupStatus = { ...connectedOk, connected: { ...connectedOk.connected!, profileFound: false, profileName: "" } };
const c7 = buildChecklist({ config: cfg, templates: allTpl(), status: noProfile, fingerprint: FP });
eq("프로필 못 찾음 → 연결 ok·프로필 x", [c7[0].ok, c7[1].ok], [true, false]);
eq("프로필 못 찾음 → 3단계", firstOpenStep(cfg, c7), 3);
const httpCfg: StoredConfig = { ...emptyCredentials(), vendor: "http", httpUrl: "https://relay/send", httpToken: "t", senderKey: "k", senderPhone: "0212345678", savedAt: "T" };
const httpTpl = Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, { code: "C", state: "unknown", name: "", checkedAt: "", fingerprint: "" }])) as TemplateMap;
const c8 = buildChecklist({ config: httpCfg, templates: httpTpl, status: { ...connectedOk, connected: { ...connectedOk.connected!, profileName: "k" } }, fingerprint: FP });
eq("http 업체: 코드만 있으면 템플릿 완료", c8[2].ok, true);

/* ── envFromStored ── */
const envS = envFromStored(cfg, allTpl());
eq("envFromStored 템플릿 코드 6종", Object.values(envS.templates), ["TPL-OK", "TPL-OK", "TPL-OK", "TPL-OK", "TPL-OK", "TPL-OK"]);
eq("envFromStored vendor", envS.vendor, "solapi");

/* ── 진행 상태 파싱 ── */
eq("status 파싱 null", parseSetupStatus(null), EMPTY_STATUS);
eq("status 파싱 깨짐", parseSetupStatus("nope"), EMPTY_STATUS);
eq("status 파싱 라운드트립", parseSetupStatus(JSON.stringify(connectedOk)), connectedOk);

/* ── 업체 오류 분류 ── */
eq("solapi 401", classifyVendorError("solapi", 401, '{"errorCode":"InvalidAPIKey"}'), "bad_key");
eq("solapi 403", classifyVendorError("solapi", 403, '{"errorCode":"AccessDenied"}'), "ip_blocked");
eq("solapi 404 template", classifyVendorError("solapi", 404, '{"errorCode":"TemplateNotFound"}'), "no_template");
eq("aligo 인증", classifyVendorError("aligo", 200, '{"code":-101,"message":"인증오류입니다"}'), "bad_key");
eq("aligo IP", classifyVendorError("aligo", 200, '{"code":-102,"message":"IP 인증 오류"}'), "ip_blocked");
eq("timeout", classifyVendorError("solapi", 0, "", "TimeoutError: aborted"), "timeout");
eq("network", classifyVendorError("http", 0, "", "TypeError: fetch failed"), "network");
eq("http 401", classifyVendorError("http", 401, ""), "bad_key");
ok("errorMessage 원인+해결", errorMessage("bad_key", "x").startsWith("키가 틀렸습니다. API Key"));
ok("errorMessage 응답 원문 포함", errorMessage("ip_blocked", "허용되지 않은 IP").includes("(업체 응답: 허용되지 않은 IP)"));

/* ── 실패 배너 ── */
eq("배너 2건 x", failureBannerNeeded(2), false);
eq("배너 3건 o", failureBannerNeeded(3), true);

/* ── 카탈로그 ── */
ok("카탈로그 solapi 4칸", VENDOR_CATALOG.solapi.fields.length === 4 && VENDOR_CATALOG.solapi.templateLookup);
ok("카탈로그 http 고급·조회 불가", VENDOR_CATALOG.http.advanced && !VENDOR_CATALOG.http.templateLookup);
ok("카탈로그 모든 칸에 «어디서 찾나요»", Object.values(VENDOR_CATALOG).every((v) => v.fields.every((f) => f.where.length > 0)));

console.log(`\n${fail === 0 ? "✅" : "❌"} alimtalk unit: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
