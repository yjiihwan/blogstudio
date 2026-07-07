import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_redeploy_20260706/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--window-size=1400,1800"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1800 });
const consoleErrors = [], pageErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (n) => { await sleep(700); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log(`  shot ${n}`); };
async function isDead() {
  return await page.evaluate(() => /couldn't load|couldn’t load|페이지를 불러올 수 없|Application error|Something went wrong/i.test(document.body.innerText || ""));
}

// login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(800);

await page.goto(`${BASE}/queue`, { waitUntil: "networkidle0" });
await sleep(600);
const links = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/queue/"]')].map(a => a.getAttribute("href")).filter(h => h && /\/queue\/[^/]+$/.test(h) && !/\/queue\/new/.test(h)))]
);

// classify each draft state by probing text; find a published one + an approved(publish-ready) one
let publishedHref = null, publishBtnHref = null;
for (const href of links.slice(0, 20)) {
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(400);
  if (await isDead()) continue;
  const state = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const btns = [...document.querySelectorAll("button")].map(b => (b.textContent || "").trim());
    return {
      published: /발행\s*완료|발행됨|게시\s*완료/.test(t),
      hasPublishBtn: btns.some(b => /^발행/.test(b) || b === "발행하기"),
      title: (document.querySelector("h1,h2")?.textContent || "").trim().slice(0, 40),
    };
  });
  if (state.published && !publishedHref) { publishedHref = href; console.log("published draft:", href, state.title); }
  if (state.hasPublishBtn && !publishBtnHref) { publishBtnHref = href; console.log("publish-ready draft:", href, state.title); }
  if (publishedHref && publishBtnHref) break;
}

if (publishedHref) {
  await page.goto(`${BASE}${publishedHref}`, { waitUntil: "networkidle0" });
  await sleep(500);
  await shot("07_published_state");
  console.log(await isDead() ? "  FAIL published dead" : "  PASS 발행완료 상태 렌더");
} else {
  console.log("  (발행완료 상태 초안 없음)");
}

if (publishBtnHref) {
  await page.goto(`${BASE}${publishBtnHref}`, { waitUntil: "networkidle0" });
  await sleep(500);
  await shot("08_publish_ready");
  console.log("  PASS 발행 컨트롤 렌더(발행 버튼 존재)");
} else {
  console.log("  (발행 대기 초안 없음)");
}

console.log("CONSOLE ERRORS:", consoleErrors.length, "PAGE ERRORS:", pageErrors.length);
fs.writeFileSync(`${OUT}/../publish_probe.json`, JSON.stringify({ publishedHref, publishBtnHref, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length }, null, 2));
await browser.close();
