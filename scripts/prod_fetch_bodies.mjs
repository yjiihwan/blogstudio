import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/blog_studio/output/brief_speaker_prod";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGETS = [
  { key: "owner", url: `${BASE}/queue/MeVz6G0P23DBrVMA` },
  { key: "expert", url: `${BASE}/queue/KPoxJgAIKWaAU1Rf` },
];
const OWNER_RE = /(저희|갖춰|마련했|준비했|찾아주|안내해|운영하|비치해|이렇게 두었|모시)/g;
const CUSTOMER_RE = /(다녀왔|가보니|방문해보|등록했|받아보니|다녀온|가봤|첫 방문|가입하고)/g;
const NARRATIVE_RE = /(저는 |제가 |쉬다가|망설|두려움|다시 잡|복귀하|용기)/g;
const analyze = (md) => ({ owner:(md.match(OWNER_RE)||[]).length, customer:(md.match(CUSTOMER_RE)||[]).length, narr:(md.match(NARRATIVE_RE)||[]).length, chars: md.replace(/\s+/g,"").length });

const extractBody = async (p) => {
  // 편집 진입 시도
  await p.evaluate(() => { const e=[...document.querySelectorAll("button")].find(x=>/편집|수정|본문/.test(x.innerText)); e&&e.click(); });
  await sleep(1000);
  let body = await p.evaluate(() => {
    const ta=[...document.querySelectorAll("textarea")].map(t=>t.value).filter(v=>v&&v.length>200).sort((a,b)=>b.length-a.length)[0];
    return ta||"";
  });
  if (!body) {
    // 뷰 모드 렌더 텍스트에서 본문 추출
    body = await p.evaluate(() => {
      const main = document.querySelector("main") || document.body;
      return main.innerText || "";
    });
  }
  return body;
};

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1400,2600"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 2600 });
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([p.click('button[type="submit"]'), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(800);
for (const t of TARGETS) {
  await p.goto(t.url, { waitUntil: "networkidle0" });
  // 스피너(생성중)가 사라질 때까지 최대 5분 대기
  let done = false;
  for (let i = 0; i < 75; i++) {
    await sleep(4000);
    const txt = await p.evaluate(() => document.body.innerText);
    if (!/AI가 초안을 작성하고 있어요|생성 중/.test(txt)) { done = true; break; }
    process.stderr.write(`  [${t.key}] 아직 생성중… ${i}\n`);
  }
  await sleep(1500);
  await p.screenshot({ path: path.join(OUT, `${t.key}.png`), fullPage: true });
  const body = await extractBody(p);
  fs.writeFileSync(path.join(OUT, `${t.key}.md`), body||"", "utf8");
  const a = analyze(body||"");
  process.stderr.write(`${t.key}: done=${done} owner ${a.owner} · customer ${a.customer} · narrative ${a.narr} · ${a.chars}자 (len ${(body||"").length})\n`);
}
await b.close();
process.exit(0);
