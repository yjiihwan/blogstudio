import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_redeploy_20260706/shots";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (n, note = "") => { results.push({ n, ok: true, note }); console.log(`PASS  ${n} ${note}`); };
const fail = (n, note = "") => { results.push({ n, ok: false, note }); console.log(`FAIL  ${n} ${note}`); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--window-size=1400,1800"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1800 });

const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (n) => { await sleep(700); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log(`  shot ${n}`); };
async function isDead() {
  return await page.evaluate(() => {
    const t = document.body.innerText || "";
    return /couldn't load|couldn’t load|페이지를 불러올 수 없|Application error|Something went wrong/i.test(t);
  });
}
async function bodyText() { return await page.evaluate(() => document.body.innerText || ""); }

// 1) LOGIN
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
await sleep(900);
await shot("01_after_login");
if (!/\/login/.test(page.url())) pass("로그인", `→ ${page.url()}`);
else fail("로그인", "여전히 /login");

// 2) QUEUE LIST
await page.goto(`${BASE}/queue`, { waitUntil: "networkidle0" });
await sleep(600);
await shot("02_queue_list");
if (await isDead()) fail("큐 목록", "dead page"); else pass("큐 목록 렌더");

// collect draft links
const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/queue/"]')]
    .map(a => a.getAttribute("href"))
    .filter(h => h && /\/queue\/[^/]+$/.test(h) && !/\/queue\/new/.test(h))
);
const uniq = [...new Set(links)];
console.log("queue links:", uniq.slice(0, 10));

// 3) OPEN a draft that has review tabs — probe several until we find one with 미리보기/편집 tabs
let tabDraftFound = false;
for (const href of uniq.slice(0, 12)) {
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(500);
  if (await isDead()) { fail("초안 열기", `dead: ${href}`); continue; }
  const hasTabs = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].map(b => (b.textContent || "").trim());
    return btns.includes("미리보기") && btns.includes("편집");
  });
  if (hasTabs) {
    tabDraftFound = href;
    pass("초안 리뷰 화면 진입", href);
    break;
  }
}

if (tabDraftFound) {
  await shot("03_draft_review_tabs");
  // BUG-1 검증: 탭 라벨 텍스트가 실제로 렌더되는지
  const tabLabels = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const preview = btns.find(b => (b.textContent || "").trim() === "미리보기");
    const edit = btns.find(b => (b.textContent || "").trim() === "편집");
    return {
      previewText: preview ? (preview.textContent || "").trim() : null,
      editText: edit ? (edit.textContent || "").trim() : null,
    };
  });
  if (tabLabels.previewText === "미리보기" && tabLabels.editText === "편집")
    pass("BUG-1 탭 라벨 렌더", `미리보기/편집 텍스트 표시`);
  else fail("BUG-1 탭 라벨", JSON.stringify(tabLabels));

  // 편집 탭 클릭 → 전환 확인
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => (x.textContent || "").trim() === "편집");
    b && b.click();
  });
  await sleep(600);
  await shot("04_edit_tab_active");
  if (await isDead()) fail("편집 탭 전환", "dead"); else pass("편집 탭 전환");

  // 미리보기 탭 복귀
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => (x.textContent || "").trim() === "미리보기");
    b && b.click();
  });
  await sleep(600);
  await shot("05_preview_tab_active");
  if (await isDead()) fail("미리보기 탭 복귀", "dead"); else pass("미리보기 탭 복귀");
} else {
  fail("초안 리뷰 화면", "미리보기/편집 탭 있는 초안 없음(리뷰 상태 초안 부재 가능)");
}

// 4) 새 초안 작성 진입 플로우(발행 전 플로우 도달 확인, 실데이터 생성 안함)
await page.goto(`${BASE}/queue/new`, { waitUntil: "networkidle0" }).catch(() => {});
await sleep(600);
await shot("06_queue_new");
if (await isDead()) fail("새 초안 작성 진입", "dead"); else pass("새 초안 작성 화면 진입");

console.log("\n=== CONSOLE ERRORS:", consoleErrors.length);
consoleErrors.slice(0, 8).forEach(e => console.log("  ", e));
console.log("=== PAGE ERRORS:", pageErrors.length);
pageErrors.slice(0, 8).forEach(e => console.log("  ", e));

const summary = {
  base: BASE,
  passed: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
  consoleErrors: consoleErrors.length,
  pageErrors: pageErrors.length,
  results,
};
fs.writeFileSync(`${OUT}/../summary.json`, JSON.stringify(summary, null, 2));
console.log("\n=== SUMMARY:", JSON.stringify({ passed: summary.passed, failed: summary.failed, consoleErrors: summary.consoleErrors, pageErrors: summary.pageErrors }));
await browser.close();
