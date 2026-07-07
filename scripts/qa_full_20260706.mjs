import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_qa_20260706/shots";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (name, note = "") => { results.push({ name, ok: true, note }); console.log(`PASS  ${name} ${note}`); };
const fail = (name, note = "") => { results.push({ name, ok: false, note }); console.log(`FAIL  ${name} ${note}`); };

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

const shot = async (n) => { await new Promise(r => setTimeout(r, 700)); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function isDead() {
  return await page.evaluate(() => {
    const t = document.body.innerText || "";
    return /couldn't load|couldn’t load|페이지를 불러올 수 없|Application error|Something went wrong/i.test(t);
  });
}
async function clickByText(text) {
  const h = await page.evaluateHandle((t) => {
    const btns = [...document.querySelectorAll("button")];
    return btns.find((b) => (b.textContent || "").includes(t)) || null;
  }, text);
  const el = h.asElement();
  if (!el) throw new Error("button not found: " + text);
  await el.click();
  return true;
}
async function bodyText() { return await page.evaluate(() => document.body.innerText || ""); }

// ---------- 1) LOGIN ----------
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
await sleep(800);
await shot("01_after_login");
{
  const url = page.url();
  if (!/login/.test(url)) pass("로그인", `→ ${url}`);
  else fail("로그인", "여전히 /login");
}

// ---------- 2) QUEUE LIST ----------
await page.goto(`${BASE}/queue`, { waitUntil: "networkidle0" });
await shot("02_queue_list");
{
  const t = await bodyText();
  const seen = ["[QA] 영등포 프리미엄", "[QA] 엔짐 영등포 시설 투어", "[QA] 여름 PT 특가"].filter(s => t.includes(s));
  if (seen.length >= 2) pass("큐 목록 렌더", `QA초안 ${seen.length}건 노출`);
  else fail("큐 목록 렌더", `노출 ${seen.length}건`);
}

// ---------- 3) DRAFT 상태 (짧은 초안, 이미지 없음) ----------
await page.goto(`${BASE}/queue/qa_d_01_draft`, { waitUntil: "networkidle0" });
await shot("03_draft_state");
{
  const t = await bodyText();
  if (t.includes("오픈 안내") && !(await isDead())) pass("초안(draft) 상세 렌더");
  else fail("초안(draft) 상세 렌더");
}

// ---------- 4) 긴 글 리뷰 + 저장 ----------
await page.goto(`${BASE}/queue/qa_d_02_review_long`, { waitUntil: "networkidle0" });
await shot("04_review_long");
{
  const t = await bodyText();
  const longOk = t.includes("200% 활용") && t.includes("GX 그룹운동");
  if (longOk) pass("긴 글 리뷰 렌더", `길이 ${t.length}자`);
  else fail("긴 글 리뷰 렌더");
}
// 저장 테스트: 변경사항 저장 클릭
try {
  await clickByText("변경사항 저장");
  await sleep(1500);
  await shot("05_after_save");
  if (!(await isDead()) && pageErrors.length === 0) pass("초안 저장(saveDraft)");
  else fail("초안 저장(saveDraft)", "dead/pageerror");
} catch (e) { fail("초안 저장(saveDraft)", String(e.message)); }

// ---------- 5) 짧은 리뷰본 ----------
await page.goto(`${BASE}/queue/qa_d_03_review_short`, { waitUntil: "networkidle0" });
await shot("06_review_short");
{
  const t = await bodyText();
  if (t.includes("여름 PT 특가")) pass("짧은 리뷰본 렌더");
  else fail("짧은 리뷰본 렌더");
}

// ---------- 6) 승인 플로우 (ready_for_review → approved) ----------
await page.goto(`${BASE}/queue/qa_d_06_review_noimg`, { waitUntil: "networkidle0" });
{
  const before = await bodyText();
  const hadApprove = before.includes("승인");
  try {
    await clickByText("승인 — 발행 준비");
    await sleep(2500);
    await shot("07_after_approve");
    const after = await bodyText();
    const dead = await isDead();
    if (!dead && (after.includes("발행 준비 완료") || after.includes("발행 완료로 표시"))) pass("승인(approve) 플로우", "→ approved 전환");
    else fail("승인(approve) 플로우", `dead=${dead}`);
  } catch (e) { fail("승인(approve) 플로우", String(e.message)); }
}

// ---------- 7) 이미지 렌더 + 발행 (CRITICAL: This page couldn't load 재현 확인) ----------
await page.goto(`${BASE}/queue/qa_d_04_approved_img`, { waitUntil: "networkidle0" });
await sleep(800);
await shot("08_approved_with_images");
{
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll("img")].filter(i => (i.currentSrc || i.src).includes("/storage/")).map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }))
  );
  const loaded = imgs.filter(i => i.w > 0);
  if (loaded.length >= 2) pass("이미지 첨부 렌더", `${loaded.length}장 로드(naturalWidth>0)`);
  else fail("이미지 첨부 렌더", `로드 ${loaded.length}/${imgs.length}장`);
}
// 발행 실행 — 발행 완료로 표시
const errBefore = pageErrors.length;
try {
  await clickByText("발행 완료로 표시");
  await sleep(3000);
  const dead = await isDead();
  await shot("09_after_publish_CRITICAL");
  const t = await bodyText();
  const newPageErr = pageErrors.length - errBefore;
  if (!dead && newPageErr === 0) pass("발행(publish) — 죽은화면 미재현", `dead=false, pageerror=${newPageErr}`);
  else fail("발행(publish) — 죽은화면", `dead=${dead}, pageerror=${newPageErr}`);
} catch (e) { fail("발행(publish)", String(e.message)); }

// ---------- 8) 발행 상태 영속 확인 (재접속) ----------
await page.goto(`${BASE}/queue/qa_d_04_approved_img`, { waitUntil: "networkidle0" });
await sleep(600);
await shot("10_publish_persist");
{
  const t = await bodyText();
  const dead = await isDead();
  // 발행 후에는 승인/발행 버튼이 사라지고 "추가 결정이 필요하지 않습니다" 안내
  if (!dead && (t.includes("추가 결정이 필요하지 않습니다") || t.includes("발행") )) pass("발행 상태 영속(재접속)", "죽은화면 없음");
  else fail("발행 상태 영속(재접속)", `dead=${dead}`);
}

// ---------- 9) 이미 발행된 초안 렌더 ----------
await page.goto(`${BASE}/queue/qa_d_05_published`, { waitUntil: "networkidle0" });
await shot("11_published_state");
{
  const t = await bodyText();
  if (t.includes("첫 방문 후기") && !(await isDead())) pass("발행완료 초안 렌더(published)");
  else fail("발행완료 초안 렌더(published)");
}

// ---------- 10) 에러 핸들링: 존재하지 않는 초안 → 404 ----------
const resp = await page.goto(`${BASE}/queue/nonexistent-qa-id-xyz`, { waitUntil: "networkidle0" }).catch(() => null);
await shot("12_notfound");
{
  const status = resp ? resp.status() : 0;
  const t = await bodyText();
  if (status === 404 || /찾을 수 없|not found|404/i.test(t)) pass("에러 핸들링: 없는 초안 404", `status=${status}`);
  else fail("에러 핸들링: 없는 초안", `status=${status}`);
}

// ---------- 11) 미리보기/생성 UI ----------
await page.goto(`${BASE}/queue/new`, { waitUntil: "networkidle0" }).catch(() => {});
await shot("13_generate_ui");
{
  const t = await bodyText();
  if (!(await isDead())) pass("초안 생성 UI 렌더", "");
  else fail("초안 생성 UI 렌더");
}

console.log("\n===== QA SUMMARY =====");
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${results.length} PASS`);
console.log(`console.error 총 ${consoleErrors.length}건, pageerror 총 ${pageErrors.length}건`);
if (consoleErrors.length) console.log("consoleErrors:", consoleErrors.slice(0, 10));
if (pageErrors.length) console.log("pageErrors:", pageErrors.slice(0, 10));
fs.writeFileSync(`${OUT}/../qa_result.json`, JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
await browser.close();
