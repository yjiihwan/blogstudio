// prod(c485b71) 배포 후 검증: 재료 고갈 '빈 껍데기' 수정.
// 루틴 주제 + 구체 재료를 일부러 안 준 브리프 → 상체 종목이 실제로 채워지는지,
// 업체 고유 수치(회원수·평점·%)·브랜드가 지어지지 않는지 육안·자동 체크. 단일 생성 1건.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const BLOG = "gN9OineD2NPzY0Ki"; // 엔짐 보강루프 테스트 (초안 0편)
const OUT = "/Users/ideagent/blog_studio/output/empty_content_prod";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLE = "여름 상체 루틴은 가볍게 시작하세요";
const BRIEF =
  "여름에 상체 운동을 가볍게 시작하는 루틴을 소개하는 글. " +
  "운동 종목·순서 등 구체 재료는 일부러 주지 않음(재료 고갈 조건 재현). " +
  "담백하게, 약 1500자. 확인 불가한 수치·실적·회원수·평점은 절대 쓰지 말 것.";

const EXERCISES = ["벤치프레스","벤치 프레스","랫풀다운","랫 풀다운","숄더프레스","숄더 프레스",
  "덤벨","로우","풀업","친업","딥스","프레스","컬","레터럴","래터럴","체스트","풀다운","익스텐션","푸시업","스쿼트"];

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--window-size=1400,2600"],
});
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 2600 });

await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([p.click('button[type="submit"]'), p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {})]);
await sleep(800);

await p.goto(`${BASE}/queue/new/manual?blogId=${BLOG}`, { waitUntil: "networkidle0" });
await sleep(3500);
await p.type('input[name="title"]', TITLE);
await p.type('textarea[name="brief"]', BRIEF);
const kw = await p.$('input[name="keywords"]');
if (kw) await kw.type("여름 상체 루틴, 상체 운동");

const btn = await p.evaluateHandle(() =>
  [...document.querySelectorAll('button[type="submit"]')].find((x) => /초안 생성/.test(x.innerText)));
await p.evaluate((el) => el.scrollIntoView({ block: "center" }), btn);
await sleep(400);
await btn.click();
for (let i = 0; i < 8; i++) { await sleep(300); if (/생성 중/.test(await p.evaluate(() => document.body.innerText))) break; }

let url = "";
for (let i = 0; i < 60; i++) {
  await sleep(4000); url = p.url();
  if (/\/queue\/[A-Za-z0-9]{6,}$/.test(url)) { process.stderr.write(`DRAFT: ${url}\n`); break; }
  if (/login/.test(url) && i > 1) { process.stderr.write("BOUNCE(login)\n"); break; }
}
await sleep(1500);
await p.screenshot({ path: path.join(OUT, "draft.png"), fullPage: true });

let body = await p.evaluate(() => {
  const ta = [...document.querySelectorAll("textarea")].map((t) => t.value).filter((v) => v && v.length > 200).sort((a, b) => b.length - a.length)[0];
  return ta || "";
});
if (!body) {
  await p.evaluate(() => { const e = [...document.querySelectorAll("button")].find((x) => /편집/.test(x.innerText)); e && e.click(); });
  await sleep(800);
  body = await p.evaluate(() => {
    const ta = [...document.querySelectorAll("textarea")].map((t) => t.value).filter((v) => v && v.length > 200).sort((a, b) => b.length - a.length)[0];
    return ta || "";
  });
}
fs.writeFileSync(path.join(OUT, "body.md"), body || "", "utf8");

const found = [...new Set(EXERCISES.filter((e) => body.includes(e)))];
// 업체 고유 수치 의심 패턴(회원수·평점·%·수상·연혁)
const claimHits = (body.match(/(회원\s*[0-9]|[0-9]+\s*명 회원|평점\s*[0-9]|[0-9]+\.[0-9]\s*점|[0-9]+\s*%|[0-9]+\s*년\s*(전통|역사|운영)|수상|1위|업계\s*[0-9])/g) || []);
const report = {
  prodCommit: "c485b71",
  charCount: (body || "").replace(/\s+/g, "").length,
  concreteExercisesFound: found,
  concreteCount: found.length,
  suspectCompanyClaims: claimHits,
  url: p.url(),
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2), "utf8");
process.stderr.write("REPORT " + JSON.stringify(report, null, 2) + "\n");
process.stderr.write("---BODY(first 900)---\n" + (body || "").slice(0, 900) + "\n");

// 정리: 생성한 테스트 초안 삭제 (UI 삭제 버튼)
try {
  await p.evaluate(() => { const e = [...document.querySelectorAll("button,a")].find((x) => /삭제/.test(x.innerText)); e && e.click(); });
  await sleep(500);
  await p.evaluate(() => { const e = [...document.querySelectorAll("button")].find((x) => /삭제|확인/.test(x.innerText)); e && e.click(); });
  await sleep(800);
  process.stderr.write("cleanup: 삭제 시도\n");
} catch (e) { process.stderr.write("cleanup skip: " + e.message + "\n"); }

await b.close();
process.exit(0);
