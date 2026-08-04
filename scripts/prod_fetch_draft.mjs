// 이미 생성된 prod 초안을 열어 완료 대기 후 본문 추출·검증 (재생성 없음).
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const DRAFT = process.argv[2] || "KeELmmA1M1USGCJ2";
const OUT = "/Users/ideagent/blog_studio/output/empty_content_prod";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXERCISES = ["벤치프레스","벤치 프레스","랫풀다운","랫 풀다운","숄더프레스","숄더 프레스",
  "덤벨","로우","풀업","친업","딥스","프레스","컬","레터럴","래터럴","체스트","풀다운","익스텐션","푸시업","스쿼트"];

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox","--window-size=1400,3200"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 3200 });
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([p.click('button[type="submit"]'), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
await sleep(800);

let body = "";
for (let i = 0; i < 45; i++) {
  await p.goto(`${BASE}/queue/${DRAFT}`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const txt = await p.evaluate(() => document.body.innerText);
  if (/생성 중|작성하고 있어요/.test(txt)) { process.stderr.write(`[${i}] still generating…\n`); await sleep(8000); continue; }
  // 편집 모드 열어 textarea 확보
  await p.evaluate(() => { const e = [...document.querySelectorAll("button")].find((x) => /편집|수정/.test(x.innerText)); e && e.click(); });
  await sleep(800);
  body = await p.evaluate(() => {
    const ta = [...document.querySelectorAll("textarea")].map((t)=>t.value).filter((v)=>v&&v.length>200).sort((a,b)=>b.length-a.length)[0];
    if (ta) return ta;
    const art = document.querySelector("article,[class*=prose],[class*=markdown]");
    return art ? art.innerText : "";
  });
  if (body && body.length > 200) break;
  process.stderr.write(`[${i}] no body yet (len=${body.length})…\n`); await sleep(6000);
}
await p.screenshot({ path: path.join(OUT, "draft_done.png"), fullPage: true });
fs.writeFileSync(path.join(OUT, "body.md"), body || "", "utf8");
const found = [...new Set(EXERCISES.filter((e)=>body.includes(e)))];
const claimHits = (body.match(/(회원\s*[0-9]|[0-9]+\s*명\s*회원|평점\s*[0-9]|[0-9]+\.[0-9]\s*점|[0-9]+\s*%|[0-9]+\s*년\s*(전통|역사|운영)|수상|1위|업계\s*[0-9])/g) || []);
const report = { prodCommit:"c485b71", draft:DRAFT, charCount:(body||"").replace(/\s+/g,"").length,
  concreteExercisesFound:found, concreteCount:found.length, suspectCompanyClaims:claimHits };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report,null,2), "utf8");
process.stderr.write("REPORT " + JSON.stringify(report,null,2) + "\n");
process.stderr.write("---BODY(first 1100)---\n" + (body||"").slice(0,1100) + "\n");
await b.close();
process.exit(0);
