import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([p.click('button[type="submit"]'), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(800);
await p.goto(`${BASE}/blogs/ZZZTMP_4634b8e4`, { waitUntil: "networkidle0" }).catch(()=>{});
await sleep(1500);
const txt = await p.evaluate(()=>document.body.innerText);
// look for schedule/cron/자동/발행 keywords
const lines = txt.split("\n").filter(l=>/스케줄|자동|발행|cron|주기|요일|시각|활성|비활성/.test(l));
console.log("SCHED_LINES:", JSON.stringify(lines.slice(0,25), null, 1));
await b.close();
