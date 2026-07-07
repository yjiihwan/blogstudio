import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
const posts = [];
page.on("response", (r) => { if (r.request().method() === "POST") posts.push(r.status()); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
await page.goto(`${BASE}/queue/qa_d_06_review_noimg`, { waitUntil: "networkidle0" });
// wait for hydration: __next hydration done — poll up to 15s clicking once hydrated
const hydrated = await page.waitForFunction(() => {
  // React 19 attaches; check that a button has React fiber props
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('승인'));
  if (!b) return false;
  const key = Object.keys(b).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
  return !!key;
}, { timeout: 20000 }).then(()=>true).catch(()=>false);
console.log("hydrated(react fiber present):", hydrated);
posts.length = 0;
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('승인')); b && b.click(); });
await sleep(4000);
console.log("POSTs after click:", JSON.stringify(posts));
console.log("statusNow:", await page.evaluate(()=>{ const m=document.body.innerText.match(/검토 대기|발행 준비 완료|발행 완료로 표시/); return m?m[0]:'?'; }));
await browser.close();
