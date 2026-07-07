import puppeteer from "puppeteer-core";
import fs from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_skills_deploy_20260707/shots";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1400,2200"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 2200 });
const consoleErrors = [], pageErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (n) => { await sleep(600); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log("  shot", n); };

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
await sleep(800);

const blogId = "8LIIM2FAcbYfu6gk";
await page.goto(`${BASE}/queue/new/manual?blogId=${blogId}`, { waitUntil: "networkidle0" });
await sleep(2500); // allow React19 hydration (controlled inputs)
await shot("07_manual_form");

// Grounded, self-contained brief so fact-guard/needsInfo passes
const titleEl = await page.$('input[name="title"]');
await titleEl.click(); await titleEl.type("엔짐 답십리점 여름 신규 PT 프로그램 안내", { delay: 12 });
const briefEl = await page.$('textarea[name="brief"]');
await briefEl.click();
await briefEl.type("엔짐 답십리점에서 여름 시즌 신규 퍼스널 트레이닝(PT) 프로그램을 시작한다. 담당 트레이너가 회원 체력 상태를 먼저 측정한 뒤 목표에 맞춰 주 2~3회 일정으로 구성한다. 냉방이 되는 실내에서 진행하며, 초보자도 자세 교정부터 단계적으로 배운다. 이 내용만 사실로 사용하고, 없는 가격·할인·수치·수상·이벤트는 지어내지 말 것.", { delay: 4 });
const kw = await page.$('input[name="keywords"], textarea[name="keywords"]');
if (kw) { await kw.click(); await kw.type("답십리 헬스장, 여름 PT", { delay: 12 }); }
const vals = await page.evaluate(() => ({
  title: document.querySelector('input[name="title"]')?.value,
  brief: (document.querySelector('textarea[name="brief"]')?.value||"").slice(0,40),
}));
console.log("field values:", JSON.stringify(vals));
await shot("08_manual_filled");

// submit — in-page click of the submit button (progressive enhancement path)
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[type="submit"]')].find(x => /초안 생성/.test(x.textContent||""));
  if (!b) return "no-btn";
  b.click();
  return "clicked";
});
console.log("submit:", clicked, "— waiting up to 150s...");
await page.waitForFunction(() => /생성 중/.test(document.body.innerText||"") || /\/queue\/[a-zA-Z0-9_-]{8,}/.test(location.pathname), { timeout: 10000, polling: 300 }).catch(()=>console.log("no pending seen — retry via requestSubmit"));
// fallback: requestSubmit if still on form and no pending
const stillForm = await page.evaluate(() => /\/queue\/new\/manual/.test(location.pathname) && !/생성 중/.test(document.body.innerText||""));
if (stillForm) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[type="submit"]')].find(x => /초안 생성/.test(x.textContent||""));
    const f = b?.closest("form");
    if (f) f.requestSubmit(b);
  });
  console.log("fallback requestSubmit fired");
}
await page.waitForFunction(() => {
  const t = document.body.innerText || "";
  return /\/queue\/[a-zA-Z0-9_-]{8,}/.test(location.pathname) || /추가 정보|정보가 부족|보강|오류|실패/i.test(t);
}, { timeout: 150000, polling: 1500 }).catch(() => console.log("wait timed out"));
await sleep(2000);
await shot("09_manual_result");

const gen = await page.evaluate(() => {
  const body = document.body.innerText || "";
  // grab the largest text block (article body) heuristically
  const paras = [...document.querySelectorAll("article, [class*=prose], main")].map(n => n.innerText||"");
  const article = paras.sort((a,b)=>b.length-a.length)[0] || body;
  return { url: location.pathname, body, article,
    dead: /couldn't load|couldn’t load|불러올 수 없/i.test(body),
    needsInfo: /추가 정보|정보가 부족|보강해/i.test(body) };
});

const banned = [
  "에 대해 알아보겠습니다","소개해 드리겠습니다","소개해드리겠습니다","이야기해 보려",
  "안녕하세요, 여러분","여러분, 안녕하세요","안녕하세요 그릴박스","안녕하세요! 그릴박스",
  "지금까지","이상으로","도움이 되셨길","다음 포스팅에서 뵙","유익한 시간 되셨",
  "바쁜 현대인","요즘 같은 시대","알아보도록 하겠습니다",
];
const hits = banned.filter(p => gen.article.includes(p));

const out = {
  url: gen.url, dead: gen.dead, needsInfo: gen.needsInfo,
  completed: /\/queue\/[a-zA-Z0-9_-]{8,}/.test(gen.url) && !gen.dead && !gen.needsInfo,
  articleLen: gen.article.length,
  bannedHits: hits,
  articleHead: gen.article.slice(0, 400),
  consoleErrors, pageErrors,
};
fs.writeFileSync(`${OUT}/../guide_manual_result.json`, JSON.stringify({ ...out, articleFull: gen.article }, null, 2));
console.log("\n===== GUIDE MANUAL RESULT =====");
console.log(JSON.stringify(out, null, 2));
await browser.close();
