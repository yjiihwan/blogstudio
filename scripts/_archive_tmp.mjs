import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox","--window-size=1400,3000"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 3000 });
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([p.click('button[type="submit"]'), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(800);
await p.goto(`${BASE}/blogs/ZZZTMP_4634b8e4`, { waitUntil: "networkidle0" }).catch(()=>{});
await sleep(2500);
// confirm this is the temp blog before mutating
const nm = await p.evaluate(()=>document.body.innerText);
if (!/ZZZ_TMP_EMOJI_VERIFY/.test(nm)) { console.log("ABORT: not temp blog"); await b.close(); process.exit(1); }
const before = await p.$eval('select[name="status"]', el=>el.value);
await p.select('select[name="status"]', 'archived');
const after = await p.$eval('select[name="status"]', el=>el.value);
console.log("STATUS before:", before, "-> after:", after);
// submit the form (저장 button)
const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button[type="submit"]')].find((x) => /저장|변경/.test(x.innerText)));
await p.evaluate((el) => el.scrollIntoView({ block: "center" }), btn);
await sleep(400);
await Promise.all([btn.click(), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
await sleep(2000);
// re-read to confirm persisted
await p.goto(`${BASE}/blogs/ZZZTMP_4634b8e4`, { waitUntil: "networkidle0" }).catch(()=>{});
await sleep(2000);
const persisted = await p.$eval('select[name="status"]', el=>el.value).catch(()=>"(no select)");
const txt = await p.evaluate(()=>document.body.innerText);
console.log("PERSISTED status:", persisted);
console.log("AUTO_ON still?:", /자동 생성 ON/.test(txt) && persisted==="active");
await b.close();
