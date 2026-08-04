import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("output/emoji_verify");
const EMOJI_RE = /(\p{Extended_Pictographic}️?)/gu;
const summary = JSON.parse(fs.readFileSync(path.join(OUT, "summary.json"), "utf8"));
const META = {
  0: { name: "없음 (전문·정보)", spec: "0개" },
  2: { name: "보통 (사람글 기본값)", spec: "4~6개" },
  3: { name: "적극 (후기·브이로그)", spec: "8~14개" },
};

function mdToHtml(md) {
  const paras = md.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras
    .map((p) => {
      if (/^<!-- IMG:/.test(p)) return `<div class="img">🖼 사진 슬롯</div>`;
      let esc = p.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      esc = esc.replace(EMOJI_RE, '<span class="em">$1</span>');
      if (/^#{2,6}\s/.test(p)) return `<h3>${esc.replace(/^#{2,6}\s/, "")}</h3>`;
      return `<p>${esc}</p>`;
    })
    .join("\n");
}

const cols = [0, 2, 3]
  .map((lv) => {
    const s = summary.find((r) => r.level === lv);
    const body = fs.readFileSync(path.join(OUT, `level_${lv}.md`), "utf8");
    return `<section>
      <header>
        <div class="lv">강도 ${lv}</div>
        <div class="nm">${META[lv].name}</div>
        <div class="stat"><b>${s.total}</b>개 이모지 · 스펙 ${META[lv].spec}
          <br>문단 ${s.paraWith}/${s.paraCount} 분포 · 헤더 ${s.headerEmoji}</div>
      </header>
      <article>${mdToHtml(body)}</article>
    </section>`;
  })
  .join("\n");

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box} body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;background:#0f1115;color:#e7eaf0;padding:28px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#9aa4b2;font-size:13px;margin-bottom:22px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start}
  section{background:#171a21;border:1px solid #262b36;border-radius:14px;overflow:hidden}
  header{padding:14px 16px;background:#1d2330;border-bottom:1px solid #2b3342}
  .lv{font-size:12px;color:#7dd3fc;font-weight:700;letter-spacing:.5px}
  .nm{font-size:15px;font-weight:700;margin:2px 0 6px}
  .stat{font-size:12px;color:#aeb7c4;line-height:1.5} .stat b{color:#4ade80;font-size:15px}
  article{padding:14px 16px;font-size:12.5px;line-height:1.65;max-height:760px;overflow:hidden}
  article h3{font-size:13.5px;margin:14px 0 6px;color:#f8fafc}
  article p{margin:0 0 9px;color:#c7ced8}
  .img{color:#5b657a;font-size:11px;border:1px dashed #333b49;border-radius:6px;padding:4px 8px;margin:6px 0;display:inline-block}
  .em{background:#3b2f10;border-radius:5px;padding:0 2px;outline:1px solid #7c5e15}
</style></head><body>
<h1>블로그 스튜디오 — 이모지 강도 레벨별 실생성 검증</h1>
<div class="sub">동일 주제·동일 페르소나(엔짐 강남 1인칭 후기), <code>emoji_intensity</code>만 0/2/3 변경 · 노란 하이라이트=이모지 · 2026-07-15 staging a61d431</div>
<div class="grid">${cols}</div>
</body></html>`;

fs.writeFileSync(path.join(OUT, "compare.html"), html, "utf8");
console.log("wrote", path.join(OUT, "compare.html"));
