import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_skills_deploy_20260707/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--window-size=1400,1900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1900 });
const consoleErrors = [], pageErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (n) => { await sleep(600); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log(`  shot ${n}`); };
const isDead = () => page.evaluate(() => /couldn't load|couldn’t load|불러올 수 없|Application error|Something went wrong|Internal Server Error/i.test(document.body.innerText || ""));

const result = { deploy: {}, publish: {}, guide: {}, errors: {} };

// ---- login ----
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(900);
result.deploy.loggedIn = !/\/login/.test(page.url());
await shot("01_after_login");

// ---- GATE1: deploy alive / queue loads ----
await page.goto(`${BASE}/queue`, { waitUntil: "networkidle0" });
await sleep(600);
result.deploy.queueDead = await isDead();
await shot("02_queue");

// ---- GATE2: publish page loads (existing published draft + a review page) ----
const links = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/queue/"]')].map(a => a.getAttribute("href")).filter(h => h && /\/queue\/[^/]+$/.test(h) && !/\/queue\/new/.test(h)))]
);
console.log("queue drafts found:", links.length);
let reviewOk = false, reviewTabsOk = false;
for (const href of links.slice(0, 6)) {
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(500);
  if (await isDead()) { console.log("DEAD:", href); continue; }
  reviewOk = true;
  // tab labels present (0826a3f fix) — 미리보기/편집 라벨
  reviewTabsOk = await page.evaluate(() => {
    const t = document.body.innerText || "";
    return /미리보기/.test(t) && /편집/.test(t);
  });
  await shot("03_review_page");
  break;
}
result.publish.reviewLoads = reviewOk;
result.publish.tabLabels = reviewTabsOk;

// ---- GATE3a: settings shows global guide enabled/active ----
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
await sleep(700);
result.guide.settingsDead = await isDead();
const guideOnPage = await page.evaluate(() => {
  const t = document.body.innerText || "";
  return {
    mentionsGuide: /공통 글쓰기|AI 티|전체 공통|글쓰기 규칙|글쓰기 가이드/.test(t),
    hasBannedRuleText: /상투적 도입부|지어내지|거짓|날조|알아보겠습니다/.test(t),
  };
});
result.guide.settings = guideOnPage;
await shot("04_settings_guide");

// ---- GATE3b: generate 1 live draft, assert guide's banned patterns absent ----
await page.goto(`${BASE}/queue/new`, { waitUntil: "networkidle0" });
await sleep(700);
await shot("05_queue_new");
// find a generate button (full-auto) — click first available
const genBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const i = btns.findIndex(b => /초안 생성/.test(b.textContent || ""));
  return i;
});
if (genBtn >= 0) {
  const before = page.url();
  await page.evaluate((i) => {
    const btns = [...document.querySelectorAll("button")].filter(b => /초안 생성/.test(b.textContent || ""));
    btns[0].click();
  }, genBtn);
  console.log("clicked 초안 생성, waiting for generation (up to 120s)...");
  // wait for navigation to a draft review page OR needsInfo/error surfaced
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return /\/queue\/[a-z0-9-]{8,}/.test(location.pathname) || /추가 정보|더 필요|보강|오류|실패|error/i.test(t);
  }, { timeout: 120000, polling: 1500 }).catch(() => console.log("gen wait timed out"));
  await sleep(1500);
  await shot("06_after_generate");
  const gen = await page.evaluate(() => {
    const body = document.body.innerText || "";
    // pull the main article/body text region if present
    return {
      url: location.pathname,
      dead: /couldn't load|couldn’t load|불러올 수 없/i.test(body),
      needsInfo: /추가 정보|더 필요|정보가 부족|보강/i.test(body),
      text: body,
    };
  });
  result.guide.genUrl = gen.url;
  result.guide.genDead = gen.dead;
  result.guide.genNeedsInfo = gen.needsInfo;
  // Banned patterns from DEFAULT_GLOBAL_GUIDE (cliché openers/closers/meta)
  const banned = [
    "에 대해 알아보겠습니다", "소개해 드리겠습니다", "이야기해 보려",
    "안녕하세요, 여러분", "여러분, 안녕하세요",
    "지금까지", "이상으로", "도움이 되셨길", "다음 포스팅에서 뵙",
    "유익한 시간 되셨",
  ];
  // only inspect the generated draft article region — approximate by full body minus nav
  const hits = banned.filter(p => gen.text.includes(p));
  result.guide.bannedHits = hits;
  result.guide.generated = gen.url && /\/queue\/[a-z0-9-]{8,}/.test(gen.url) && !gen.dead;
} else {
  result.guide.generated = "no_gen_button";
  console.log("no 초안 생성 button on /queue/new");
}

result.errors.console = consoleErrors.slice(0, 20);
result.errors.page = pageErrors.slice(0, 20);

fs.writeFileSync(`${OUT}/../result.json`, JSON.stringify(result, null, 2));
console.log("\n===== RESULT =====");
console.log(JSON.stringify(result, (k, v) => k === "text" ? undefined : v, 2));
await browser.close();
