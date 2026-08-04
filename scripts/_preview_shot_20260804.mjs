import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SRC = "/tmp/verify_relax_20260804_r2";
const OUT = process.argv[2] ?? "/tmp/blogstudio_verify_20260804_preview.png";

const cases = [
  { key: "A_pilates_review", label: "A · 필라테스 방문 후기 (고객 1인칭)" },
  { key: "B_cafe_review", label: "B · 카페 방문 후기 (재료 부족 케이스)" },
  { key: "C_autoshop_info", label: "C · 자동차정비 정보글 (전문가)" },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cols = cases
  .map((c) => {
    const meta = JSON.parse(fs.readFileSync(`${SRC}/${c.key}.json`, "utf8"));
    const body = fs.readFileSync(`${SRC}/${c.key}.md`, "utf8");
    const intro = body
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("##") && !l.startsWith("<!--"))
      .slice(0, 3)
      .join("\n\n");
    const heads = meta.headings.map((h) => `<li>${esc(h.replace(/^##\s*/, ""))}</li>`).join("");
    return `
      <section class="card">
        <h2>${esc(c.label)}</h2>
        <div class="stats">
          <span>${meta.charsNoSpace.toLocaleString()}자</span>
          <span class="ok">[슬롯:] ${meta.slotPlaceholders}개</span>
          <span>사진 ${meta.imgMarkers}</span>
          <span>섹션 ${meta.headings.length}</span>
          <span>human ${meta.humanScore}</span>
        </div>
        <h3>섹션 제목</h3>
        <ol class="heads">${heads}</ol>
        <h3>도입부 원문</h3>
        <p class="intro">${esc(intro).replace(/\n\n/g, "</p><p class='intro'>")}</p>
      </section>`;
  })
  .join("");

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;padding:36px;background:#f4f5f7;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#1f2328;
       word-break:keep-all;overflow-wrap:break-word}
  header{margin-bottom:24px}
  h1{margin:0 0 8px;font-size:26px}
  .sub{color:#57606a;font-size:14px;line-height:1.6}
  .sub b{color:#1f2328}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .card{background:#fff;border:1px solid #d8dee4;border-radius:12px;padding:20px}
  .card h2{margin:0 0 12px;font-size:16px}
  .card h3{margin:16px 0 6px;font-size:12px;color:#57606a;letter-spacing:.04em}
  .stats{display:flex;flex-wrap:wrap;gap:6px}
  .stats span{background:#eef1f4;border-radius:999px;padding:3px 10px;font-size:12px}
  .stats .ok{background:#dcfce7;color:#14532d;font-weight:600}
  .heads{margin:0;padding-left:20px;font-size:13px;line-height:1.7}
  .intro{margin:0 0 8px;font-size:13px;line-height:1.75;color:#333}
  footer{margin-top:22px;font-size:13px;color:#57606a;line-height:1.7}
</style></head><body>
<header>
  <h1>블로그 스튜디오 — 후기글 문체·구조 완화 실생성 검증</h1>
  <div class="sub">
    staging 코드 <b>eeace37</b> · gpt-5.5 · 초안 3편 실생성 · 재수정 1회<br>
    항목 ①번역체·연출 제거 ②억지 감각/감정 제거 ③섹션 6단 고정 해제 ④일반론 도배 없음 — <b>전 항목 통과</b>
  </div>
</header>
<div class="grid">${cols}</div>
<footer>
  ⚠️ staging 서버엔 LLM 키가 없어(환경변수·DB 모두) 서버 생성 불가 → 동일 커밋 코드를 로컬에서 실행해 생성.<br>
  발행은 dry_run 유지 · main/prod 미접촉.
</footer>
</body></html>`;

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 1200, deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: "load" });
await p.screenshot({ path: OUT, fullPage: true });
await b.close();
console.log("saved:", OUT);
