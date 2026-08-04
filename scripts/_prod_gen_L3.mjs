import puppeteer from "puppeteer-core";
import fs from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const BLOG = process.argv[2];
const OUT = "output/emoji_warn_prod";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BRIEF =
  "운동을 몇 년 쉬다가 엔짐 강남점을 2주간 다녀본 개인 후기. 처음 등록할 때의 망설임, " +
  "최신 수입 머신과 1:1 PT룸을 써본 느낌, 샤워/라운지 시설, 2주 뒤 몸과 마음의 변화. " +
  "시설은 담백하게 사실 위주로, 감정이 올라오는 순간(첫 등록의 두려움·PT 후 성취감·2주 뒤 뿌듯함)엔 솔직하게. 약 1800자.";

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1400,2600"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 2600 });
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([p.click('button[type="submit"]'), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(800);
await p.goto(`${BASE}/queue/new/manual?blogId=${BLOG}`, { waitUntil: "networkidle0" });
await sleep(3500);
await p.type('input[name="title"]', "엔짐 강남점 2주 다녀본 솔직 후기");
await p.type('textarea[name="brief"]', BRIEF);
const kw = await p.$('input[name="keywords"]'); if (kw) await kw.type("엔짐 강남, 헬스장 후기, PT");
const btn = await p.evaluateHandle(() => [...document.querySelectorAll('button[type="submit"]')].find((x) => /초안 생성/.test(x.innerText)));
await p.evaluate((el) => el.scrollIntoView({ block: "center" }), btn);
await sleep(400); await btn.click();
let ok = false; for (let i = 0; i < 8; i++) { await sleep(300); if (/생성 중/.test(await p.evaluate(() => document.body.innerText))) { ok = true; break; } }
console.log("react intercept:", ok);
let url = ""; for (let i = 0; i < 70; i++) { await sleep(4000); url = p.url(); if (/\/queue\/[A-Za-z0-9]{6,}$/.test(url)) { console.log("DRAFT:", url); break; } if (/login/.test(url) && i > 1) { console.log("BOUNCE"); break; } }
await sleep(2000);
let body = await p.evaluate(() => { const ta = [...document.querySelectorAll("textarea")].map((t) => t.value).filter((v) => v && v.length > 200).sort((a, b) => b.length - a.length)[0]; return ta || ""; });
if (!body) { await p.evaluate(() => { const e = [...document.querySelectorAll("button")].find((x) => /편집/.test(x.innerText)); e && e.click(); }); await sleep(800); body = await p.evaluate(() => { const ta = [...document.querySelectorAll("textarea")].map((t) => t.value).filter((v) => v && v.length > 200).sort((a, b) => b.length - a.length)[0]; return ta || ""; }); }
await p.screenshot({ path: `${OUT}/gen_L3_draft.png`, fullPage: true });
fs.writeFileSync(`${OUT}/gen_L3_body.md`, body || "");
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const emojis = (body || "").match(EMOJI_RE) || [];
const headerEmoji = /^#{1,6}[^\n]*\p{Extended_Pictographic}/mu.test(body || "");
console.log("FINAL_URL:", p.url(), "BODY_LEN:", (body || "").length);
console.log("EMOJI_COUNT:", emojis.length, "spec L3=[8,14]", "HEADER_EMOJI:", headerEmoji);
console.log("EMOJIS:", emojis.join(" "));
await b.close();
