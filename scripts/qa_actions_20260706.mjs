import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_qa_20260706/shots";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1400,1800"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1800 });
const posts = [];
page.on("response", (r) => { if (r.request().method() === "POST") posts.push({ url: r.url().slice(-40), status: r.status() }); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// in-page DOM click — React onClick가 확실히 발화되도록
async function domClick(text) {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(t));
    if (!b) return false;
    b.scrollIntoView({ block: "center" });
    b.click();
    return true;
  }, text);
  if (!ok) throw new Error("no button: " + text);
}
async function status() {
  return await page.evaluate(() => {
    const badge = [...document.querySelectorAll("*")].map(e => e.textContent).find(() => false);
    return document.body.innerText.slice(0, 0);
  });
}

// LOGIN
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(600);

// APPROVE qa_d_06
await page.goto(`${BASE}/queue/qa_d_06_review_noimg`, { waitUntil: "networkidle0" });
await sleep(1200); // hydration
posts.length = 0;
await domClick("승인");
await sleep(3500);
await page.screenshot({ path: `${OUT}/07b_after_approve.png`, fullPage: true });
console.log("[approve] POالسTs:", JSON.stringify(posts));
console.log("[approve] bodyHasApproved:", (await page.evaluate(() => document.body.innerText.includes("발행 완료로 표시"))));

// PUBLISH qa_d_04 (approved → published)
await page.goto(`${BASE}/queue/qa_d_04_approved_img`, { waitUntil: "networkidle0" });
await sleep(1200);
posts.length = 0;
const errBefore = 0;
await domClick("발행 완료로 표시");
await sleep(3500);
const dead = await page.evaluate(() => /couldn't load|couldn’t load|Application error/i.test(document.body.innerText));
await page.screenshot({ path: `${OUT}/09b_after_publish.png`, fullPage: true });
console.log("[publish] POSTs:", JSON.stringify(posts));
console.log("[publish] dead:", dead);
console.log("[publish] bodyHasNoDecision:", (await page.evaluate(() => document.body.innerText.includes("추가 결정이 필요하지 않습니다"))));

// SAVE qa_d_02 (edit title then save)
await page.goto(`${BASE}/queue/qa_d_02_review_long`, { waitUntil: "networkidle0" });
await sleep(1200);
posts.length = 0;
await domClick("변경사항 저장");
await sleep(2500);
await page.screenshot({ path: `${OUT}/05b_after_save.png`, fullPage: true });
console.log("[save] POSTs:", JSON.stringify(posts));

await browser.close();
