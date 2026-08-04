// prod(59dcab3) 실검증: 초안 brief 화자 지정.
// 같은 주제/브리프로 화자만 바꿔 3건 생성 → 톤 마커 집계 + 스샷 + 본문 저장.
//   고객(first_person) → 후기 톤, review_v1 ON (개인 서사 정상)
//   운영자·직원(owner)  → 업체 톤, 억지 개인고백 없어야 함 (review_v1 OFF)
//   전문가(expert)      → 해설 톤, 억지 개인고백 없어야 함 (review_v1 OFF)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const BLOG = "gN9OineD2NPzY0Ki"; // 엔짐 보강루프 테스트 (초안 0편)
const OUT = "/Users/ideagent/blog_studio/output/brief_speaker_prod";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLE = "여름 운동 루틴, 엔짐 강남에서 이렇게 시작하세요";
const BRIEF =
  "엔짐 강남점을 배경으로 여름철 운동 루틴을 소개하는 글. " +
  "주 3~4회 기준 상·하체 분할, 유산소 배치, 최신 수입 웨이트 머신과 1:1 PT룸 활용법, 샤워/라운지로 마무리하는 동선. " +
  "친절하고 담백하게. 약 1600자. 확인 불가한 수치·실적은 쓰지 말 것.";

// 화자 마커 사전
const OWNER_RE = /(저희|갖춰|마련했|준비했|찾아주|안내해|운영하|비치해|이렇게 두었|모시)/g;
const CUSTOMER_RE = /(다녀왔|가보니|방문해보|등록했|받아보니|다녀온|가봤|첫 방문|가입하고)/g;
const NARRATIVE_RE = /(저는 |제가 |쉬다가|망설|두려움|다시 잡|복귀하|용기)/g;

const analyze = (md) => ({
  owner: (md.match(OWNER_RE) || []).length,
  customer: (md.match(CUSTOMER_RE) || []).length,
  narr: (md.match(NARRATIVE_RE) || []).length,
  chars: md.replace(/\s+/g, "").length,
});

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

const CASES = [
  { key: "customer_first_person", speaker: "first_person", label: "고객 후기(1인칭)" },
  { key: "owner", speaker: "owner", label: "운영자·직원(업체측=직원/사장)" },
  { key: "expert", speaker: "expert", label: "전문가 해설" },
];

const results = [];
for (const c of CASES) {
  process.stderr.write(`\n[gen] ${c.label} (speaker=${c.speaker}) …\n`);
  await p.goto(`${BASE}/queue/new/manual?blogId=${BLOG}`, { waitUntil: "networkidle0" });
  await sleep(3500); // React 하이드레이션
  await p.type('input[name="title"]', `${TITLE} [${c.speaker}]`);
  await p.type('textarea[name="brief"]', BRIEF);
  const kw = await p.$('input[name="keywords"]');
  if (kw) await kw.type("엔짐 강남, 여름 운동 루틴, PT");
  // 화자 select 지정
  await p.select('select[name="speaker"]', c.speaker);
  const selected = await p.$eval('select[name="speaker"]', (el) => el.value);
  process.stderr.write(`  speaker select value = ${selected}\n`);

  const btn = await p.evaluateHandle(() =>
    [...document.querySelectorAll('button[type="submit"]')].find((x) => /초안 생성/.test(x.innerText)));
  await p.evaluate((el) => el.scrollIntoView({ block: "center" }), btn);
  await sleep(400);
  await btn.click();
  let intercepted = false;
  for (let i = 0; i < 8; i++) { await sleep(300); if (/생성 중/.test(await p.evaluate(() => document.body.innerText))) { intercepted = true; break; } }
  process.stderr.write(`  react intercept: ${intercepted}\n`);

  let url = "";
  for (let i = 0; i < 60; i++) {
    await sleep(4000); url = p.url();
    if (/\/queue\/[A-Za-z0-9]{6,}$/.test(url)) { process.stderr.write(`  DRAFT: ${url}\n`); break; }
    if (/login/.test(url) && i > 1) { process.stderr.write("  BOUNCE(login)\n"); break; }
  }
  await sleep(1500);
  await p.screenshot({ path: path.join(OUT, `${c.key}.png`), fullPage: true });
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
  fs.writeFileSync(path.join(OUT, `${c.key}.md`), body || "", "utf8");
  const a = analyze(body || "");
  process.stderr.write(`  → owner:${a.owner} customer:${a.customer} narrative:${a.narr} ${a.chars}자  url=${p.url()}\n`);
  results.push({ ...c, url: p.url(), ...a, bodyLen: (body || "").length });
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2), "utf8");
process.stderr.write("\n=== SUMMARY ===\n");
for (const r of results) process.stderr.write(`${r.label}: owner ${r.owner} · customer ${r.customer} · narrative ${r.narr} · ${r.chars}자\n`);
await b.close();
process.exit(0);
