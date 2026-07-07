import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_augment_deploy_20260705";
const SEOUL = "blog_seoul_life";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1360,1700"] });
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 1700 });
page.on("response", (res) => {
  const u = res.url();
  if (u.includes("/queue/new/manual") || (res.request().method() === "POST")) {
    console.log(`[resp] ${res.status()} ${res.request().method()} ${u.slice(0, 80)}`);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
console.log("[login]", page.url());

await page.goto(`${BASE}/queue/new/manual?blogId=${SEOUL}`, { waitUntil: "networkidle0" });
await sleep(600);
const hasTitle = await page.$('input[name="title"]');
console.log("[manual page] title field present:", !!hasTitle, "url:", page.url());
if (!hasTitle) { const t = await page.evaluate(()=>document.body.innerText.slice(0,600)); console.log("[page text]", t); await browser.close(); process.exit(1); }

await page.type('input[name="title"]', "여름 프로모션 안내");
await page.type('textarea[name="brief"]', "홍보 글 하나 써줘");
await page.screenshot({ path: `${OUT}/b_only_before.png`, fullPage: true });
console.log("[submit] clicking...");
await page.click('button[type="submit"]');

for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const url = page.url();
  const supp = await page.$('textarea[name="supplement"]');
  const bt = await page.evaluate(() => document.body.innerText);
  const needs = bt.includes("정보가 조금 부족합니다");
  const login = url.includes("/login");
  if (supp && needs) { console.log(`[${i}s] NEEDS_INFO ✅`); await page.screenshot({ path: `${OUT}/b_only_needsinfo.png`, fullPage: true }); break; }
  if (login) { console.log(`[${i}s] REDIRECT TO LOGIN ❌ url=${url}`); await page.screenshot({ path: `${OUT}/b_only_login.png`, fullPage: true }); break; }
  if (i === 19) { console.log("[timeout] no needsInfo, no login. url=", url); await page.screenshot({ path: `${OUT}/b_only_timeout.png`, fullPage: true }); }
}
await browser.close();
