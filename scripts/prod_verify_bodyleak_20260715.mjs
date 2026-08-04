import puppeteer from "puppeteer-core";
import fs from "node:fs";

// prod 본문누출 fix(fea060d) 실서버 반영 육안검증. 사용자 Chrome 미사용(헤드리스 셸).
const CHROME = "/Users/ideagent/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_body_leak_fix_prod_20260715";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BRIEF =
  "엔짐 프리미엄 피트니스의 회원 라운지 이용 안내 블로그 글. 톤은 프리미엄·정중. 후기형 관점을 중심에 두고, 편안한 분위기와 브랜드 지향점, 이용 안내를 소개. 공백 제외 2400자 내외로 충실히 작성하되, 가격·할인율·수상·순위·회원수 같은 확인 불가 수치는 절대 쓰지 말고 분위기·브랜드 철학 중심으로.";

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--window-size=1400,2800"],
});
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 2800 });

// 로그인
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([
  p.click('button[type="submit"]'),
  p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
await sleep(800);

// blogId 탐색 ('new' 등 예약어 제외, 하이픈 허용)
await p.goto(`${BASE}/blogs`, { waitUntil: "networkidle0" }).catch(() => {});
await sleep(500);
let blogId = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/blogs/"]')]
    .map((x) => x.getAttribute("href") || "")
    .map((h) => (h.match(/\/blogs\/([A-Za-z0-9_-]+)/) || [])[1])
    .filter((id) => id && id !== "new");
  return a[0] || "";
});
if (!blogId) blogId = "8LIIM2FAcbYfu6gk";
console.log("blogId:", blogId);
if (!blogId) {
  console.log("NO_BLOG_FOUND");
  await p.screenshot({ path: `${OUT}/00_blogs.png`, fullPage: true });
  await b.close();
  process.exit(2);
}

// 수동 초안 생성
await p.goto(`${BASE}/queue/new/manual?blogId=${blogId}`, { waitUntil: "networkidle0" });
await sleep(3500);
await p.type('input[name="title"]', "엔짐 회원 라운지 이용 안내");
await p.type('textarea[name="brief"]', BRIEF);
const kw = await p.$('input[name="keywords"]');
if (kw) await kw.type("엔짐, 프리미엄 피트니스, 라운지");
const btn = await p.evaluateHandle(() =>
  [...document.querySelectorAll('button[type="submit"]')].find((x) => /초안 생성/.test(x.innerText))
);
await p.evaluate((el) => el.scrollIntoView({ block: "center" }), btn);
await sleep(500);
await btn.click();

let started = false;
for (let i = 0; i < 8; i++) {
  await sleep(400);
  if (/생성 중/.test(await p.evaluate(() => document.body.innerText))) {
    started = true;
    break;
  }
}
console.log("react intercept:", started);

let url = "";
for (let i = 0; i < 60; i++) {
  await sleep(4000);
  url = p.url();
  if (/\/queue\/[A-Za-z0-9]{6,}$/.test(url)) {
    console.log("DRAFT:", url);
    break;
  }
  if (/login/.test(url) && i > 1) {
    console.log("BOUNCE");
    break;
  }
}
await sleep(2000);
await p.screenshot({ path: `${OUT}/01_draft_full.png`, fullPage: true });

// 저장된 본문(에디터 textarea) 추출
let body = await p.evaluate(() => {
  const ta = [...document.querySelectorAll("textarea")]
    .map((t) => t.value)
    .filter((v) => v && v.length > 200)
    .sort((a, b) => b.length - a.length)[0];
  return ta || "";
});
// 미리보기 탭 렌더 HTML
let previewHtml = "";
try {
  await p.evaluate(() => {
    const e = [...document.querySelectorAll("button,[role=tab]")].find((x) => /미리보기|preview/i.test(x.innerText));
    e && e.click();
  });
  await sleep(1200);
  await p.screenshot({ path: `${OUT}/02_preview.png`, fullPage: true });
  previewHtml = await p.evaluate(() => document.body.innerHTML);
} catch {}

const pageText = await p.evaluate(() => document.body.innerText);
fs.writeFileSync(`${OUT}/body.md`, body || "");
fs.writeFileSync(`${OUT}/pagetext.txt`, pageText);
fs.writeFileSync(`${OUT}/preview.html`, previewHtml || "");

// 누출 스캔
const GUIDE_HINT = /(쓰기\s*좋|중심에\s*(두|둔|둡)|형\s*글(로|을|로서)|톤으로\s*(쓰|작성|풀)|권장(합니다|해요|한다|됩니다)|작성하면\s*좋|구성(으로|이)\s*좋|참고\s*[:：]|메모\s*[:：]|작성\s*(가이드|지침|팁)|다음\s*지침|후기형|정보형|공감형)/;
const isFullyItalic = (line) =>
  (/^\*.+\*$/.test(line) && !/^\*\*/.test(line)) || (/^_.+_$/.test(line) && !/^__/.test(line));
const bodyLines = (body || "").split("\n").map((l) => l.trim());
const leakedInstr = bodyLines.filter((t) => t && isFullyItalic(t) && GUIDE_HINT.test(t.replace(/^[*_]+/, "").replace(/[*_]+$/, "")));
const placeholderInBody = /\[이미지\s*\d+\s*—\s*미연결\]/.test(body || "");
const placeholderInPreview = /img-placeholder|미연결\]/.test(previewHtml || "");

const result = {
  blogId,
  draftUrl: url,
  bodyLen: (body || "").length,
  leakedInstructionLines: leakedInstr,
  placeholderInBody,
  placeholderInPreview,
  pass: leakedInstr.length === 0 && !placeholderInBody && !placeholderInPreview && (body || "").length > 500,
};
fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
console.log("RESULT:", JSON.stringify(result));
await b.close();
