import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_augment_deploy_20260705";
const EMAIL = "admin@blogstudio.local", PW = "studio1234!";
const ENZYME = "SRNneUDofXRMhC--";      // 엔짐 영등포, 페르소나 충실 → 정상생성
let THIN = null;                         // 아래에서 생성하는 '희소 페르소나' 테스트 블로그
const NEEDS = "정보가 조금 부족합니다";
const LIMIT = "정보 부족으로 일부 내용을 일반화";

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1360,1700"] });
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 1700 });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

async function shot(n) { await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); }
async function bodyText() { return page.evaluate(() => document.body.innerText); }
async function gotoManual(id) { await page.goto(`${BASE}/queue/new/manual?blogId=${id}`, { waitUntil: "networkidle0" }); await sleep(600); }
async function fill(sel, val) {
  await page.evaluate((s) => { const e = document.querySelector(s); if (e) { e.value = ""; e.focus(); } }, sel);
  await page.type(sel, val, { delay: 2 });
}
// 반자동 폼(=input[name=title] 포함)의 제출 버튼만 정확히 클릭 — 사이드바 로그아웃 버튼 회피
async function submitForm() {
  await page.evaluate(() => {
    const anchor = document.querySelector('input[name="title"]') || document.querySelector('textarea[name="supplement"]');
    const form = anchor.closest("form");
    const btn = [...form.querySelectorAll('button[type="submit"]')].pop();
    btn.click();
  });
}
// 제출 버튼이 '생성 중...'(pending)인지 — 재작성 라운드에선 대기 중 직전 needsInfo 블록이 화면에
// 그대로 남으므로, pending 동안엔 판단을 보류해야 오탐(레이스)이 없다.
async function isPending() {
  return page.evaluate(() => {
    const anchor = document.querySelector('input[name="title"]') || document.querySelector('textarea[name="supplement"]');
    const form = anchor?.closest("form");
    if (!form) return false;
    const btn = [...form.querySelectorAll('button[type="submit"]')].pop();
    return !!btn && /생성\s*중/.test(btn.innerText || "");
  });
}
function isDraftUrl(url, start) {
  return /\/queue\/[A-Za-z0-9_-]{6,}(\?|$)/.test(url) && !url.includes("/queue/new") && url !== start;
}
async function submitAndWait(maxMs = 210000) {
  const start = page.url();
  await submitForm();
  const t0 = Date.now();
  // ① 제출 반영 대기: 즉시 리다이렉트(빠른 생성) 또는 pending 진입 확인
  while (Date.now() - t0 < 15000) {
    await sleep(500);
    if (isDraftUrl(page.url(), start)) return { kind: "draft", url: page.url() };
    if (await isPending()) break;
  }
  // ② pending 해소까지 대기한 뒤에만 결과를 판정
  while (Date.now() - t0 < maxMs) {
    await sleep(1500);
    let url, bt;
    try { url = page.url(); bt = await bodyText(); } catch { continue; }
    if (url.includes("/login")) return { kind: "login" };
    if (isDraftUrl(url, start)) return { kind: "draft", url };
    if (await isPending()) continue; // 아직 생성 중 → 판단 보류(직전 needsInfo 잔상 무시)
    if (bt.includes(NEEDS) && await page.$('textarea[name="supplement"]')) return { kind: "needsInfo" };
    const m = bt.match(/([^\n]*(권한이 없습니다|오류|생성에 실패)[^\n]*)/);
    if (m) return { kind: "error", msg: m[1].slice(0, 120) };
  }
  return { kind: "timeout" };
}

// 로그인
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PW);
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
console.log("[login]", page.url());

/* 희소 페르소나 테스트 블로그 생성(purpose/audience/brandVoice 비움 → ① 되묻기 결정론) */
console.log("\n=== 테스트 블로그 생성(희소 페르소나) ===");
await page.goto(`${BASE}/blogs/new`, { waitUntil: "networkidle0" });
await sleep(500);
const naverId = "augment_test_" + Date.now();
await fill('input[name="naverBlogId"]', naverId);
await fill('input[name="displayName"]', "엔짐 보강루프 테스트");
await page.evaluate(() => {
  const form = document.querySelector('input[name="naverBlogId"]').closest("form");
  [...form.querySelectorAll('button[type="submit"]')].pop().click();
});
await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
const murl = page.url();
const m = murl.match(/\/blogs\/([A-Za-z0-9_-]+)/);
THIN = m ? m[1] : null;
console.log("[test blog] id =", THIN, "url =", murl);
if (!THIN) { console.log("블로그 생성 실패:", (await bodyText()).slice(0, 300)); await browser.close(); process.exit(1); }

/* (a) 정상 글 생성 — 엔짐 영등포, 충실 페르소나 + 사실 풍부 brief */
console.log("\n=== (a) 정상 글 생성 ===");
await gotoManual(ENZYME);
await fill('input[name="title"]', "엔짐 영등포점 겨울 회원권 안내");
await fill('textarea[name="brief"]', "12월 겨울 회원권 3개월 등록 시 1개월 무료, PT 10회 패키지 15% 할인, 신규 인바디 측정 무료 제공. 운영시간 평일 오전 6시부터 밤 12시까지.");
await shot("a1_before");
let r = await submitAndWait();
console.log("(a) →", JSON.stringify(r));
await shot("a2_after");
results.push({ s: "a", pass: r.kind === "draft", note: r.kind === "draft" ? `정상 초안 생성 ${r.url}` : JSON.stringify(r) });

/* (b) 정보 부족 → 되묻기 — seoul, 얇은 brief */
console.log("\n=== (b) 정보 부족 되묻기 ===");
await gotoManual(THIN);
await fill('input[name="title"]', "여름 프로모션 안내");
await fill('textarea[name="brief"]', "홍보 글 하나 써줘");
await shot("b1_before");
r = await submitAndWait(30000);
console.log("(b) →", JSON.stringify(r));
await shot("b2_needsinfo");
const bPass = r.kind === "needsInfo";
results.push({ s: "b", pass: bPass, note: bPass ? "되묻기 패널 정상 노출" : JSON.stringify(r) });

/* (c) 추가 정보 입력 → 재생성·누적 반영 (동일 폼 계속) */
console.log("\n=== (c) 추가정보 후 재생성 누적 ===");
if (bPass) {
  await fill('textarea[name="supplement"]', "8/1~8/15 여름 회원권 20% 할인, 신규 PT 등록 시 인바디 3회 무료 제공, 라운지 냉음료 무료, 주 3회 그룹 GX 클래스 신설, 운영시간 오전 6시부터 밤 12시.");
  await shot("c1_supplement");
  r = await submitAndWait();
  console.log("(c) →", JSON.stringify(r));
  await shot("c2_draft");
  if (r.kind === "draft") {
    const bt = await bodyText();
    const reflected = bt.includes("20%") || bt.includes("인바디") || bt.includes("GX");
    results.push({ s: "c", pass: reflected, note: `초안 생성, 누적정보 본문반영=${reflected}` });
  } else results.push({ s: "c", pass: false, note: JSON.stringify(r) });
} else results.push({ s: "c", pass: false, note: "(b) 미통과로 스킵" });

/* (d) 무의미 재입력 → 루프 종료 + 한계 고지 */
console.log("\n=== (d) 무의미 입력 → 루프종료+한계고지 ===");
await gotoManual(THIN);
await fill('input[name="title"]', "가을 회원 모집 안내");
await fill('textarea[name="brief"]', "글 써줘");
r = await submitAndWait(30000);
console.log("(d) 1차 →", JSON.stringify(r));
await shot("d1_needsinfo");
if (r.kind === "needsInfo") {
  await fill('textarea[name="supplement"]', "ㅇㅇ");   // 정규화 <4 → stalled → 한계고지 후 생성
  await shot("d2_meaningless");
  r = await submitAndWait();
  console.log("(d) 2차 →", JSON.stringify(r));
  await shot("d3_after");
  if (r.kind === "draft") {
    const bt = await bodyText();
    results.push({ s: "d", pass: bt.includes(LIMIT), note: `루프종료(초안생성), 한계고지=${bt.includes(LIMIT)}` });
  } else if (r.kind === "needsInfo") {
    results.push({ s: "d", pass: false, note: "무의미 입력에도 되묻기 반복(루프 미종료)" });
  } else results.push({ s: "d", pass: false, note: JSON.stringify(r) });
} else results.push({ s: "d", pass: false, note: `1차가 되묻기 아님: ${JSON.stringify(r)}` });

console.log("\n========== 결과 요약 ==========");
for (const x of results) console.log(`(${x.s}) ${x.pass ? "PASS ✅" : "FAIL ❌"} — ${x.note}`);
console.log("브라우저 콘솔 에러:", errs.length);
await browser.close();
const allPass = results.length === 4 && results.every((x) => x.pass);
console.log(allPass ? "\nALL PASS ✅" : "\nSOME FAIL ❌");
process.exit(allPass ? 0 : 1);
