import puppeteer from "puppeteer-core";
import fs from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const BLOG = process.argv[2] || "SRNneUDofXRMhC--";
const OUT = "output/emoji_warn";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1400,3000"],
});
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 3000 });
p.on("console", (m) => { const t = m.text(); if (/error|warn|hydrat/i.test(t)) console.log("  [console]", t.slice(0, 160)); });
p.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 160)));

await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([
  p.click('button[type="submit"]'),
  p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
await sleep(1500);
await p.goto(`${BASE}/blogs/${BLOG}`, { waitUntil: "networkidle0" });
await sleep(5000); // React19 하이드레이션 대기(메모: 조급하면 미인터랙티브)

// Native mouse click on the exact-label segment button (real user click → React19 onClick).
async function clickSegExact(label) {
  const box = await p.evaluate((t) => {
    const btns = [...document.querySelectorAll('button[type="button"]')];
    const el = btns.find((b) => b.textContent.replace(/\s+/g, " ").trim() === t);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  if (!box) throw new Error("seg not found: " + label);
  await sleep(200);
  await p.mouse.click(box.x, box.y);
  await sleep(600);
}

async function state() {
  return p.evaluate(() => {
    const g = (n) => document.querySelector(`input[name="${n}"]`)?.value ?? null;
    const alert = document.querySelector('[role="alert"]');
    return { formality: g("formality"), emojiIntensity: g("emojiIntensity"), warn: alert ? alert.textContent.trim() : null };
  });
}

async function shot(name) {
  // frame the 이모지 강도 block: find its <label> then screenshot the enclosing block + following alert
  const box = await p.evaluate(() => {
    const labs = [...document.querySelectorAll("label")];
    const lab = labs.find((e) => e.textContent.replace(/\s+/g, " ").trim() === "이모지 강도");
    if (!lab) return null;
    const block = lab.parentElement; // div.space-y-2 wrapping label + SegmentChoice + hints + alert
    block.scrollIntoView({ block: "center" });
    const r = block.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await sleep(400);
  if (!box) { await p.screenshot({ path: `${OUT}/${name}_FULL.png`, fullPage: true }); return; }
  await p.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: Math.min(1000, box.w + 20), height: box.h + 24 },
  });
}

const results = {};

await clickSegExact("정중체");
await clickSegExact("적극 (후기·브이로그)");
results.A = await state(); await shot("A_formal_L3");
console.log("A 정중체+적극(L3):", JSON.stringify(results.A));

await clickSegExact("친근체");
results.B = await state(); await shot("B_informal_L3");
console.log("B 친근체+적극(L3):", JSON.stringify(results.B));

await clickSegExact("정중체");
await clickSegExact("보통 (표준)");
results.C = await state(); await shot("C_formal_L2");
console.log("C 정중체+보통(L2):", JSON.stringify(results.C));

await clickSegExact("없음 (전문·격식)");
results.D = await state(); await shot("D_formal_L0");
console.log("D 정중체+없음(L0):", JSON.stringify(results.D));

await b.close();
const verdict = {
  A_should_warn: !!results.A.warn && results.A.formality === "formal" && results.A.emojiIntensity === "3",
  B_no_warn: !results.B.warn,
  C_should_warn: !!results.C.warn,
  D_no_warn: !results.D.warn,
};
console.log("\nVERDICT:", JSON.stringify(verdict, null, 0));
console.log("PASS:", Object.values(verdict).every(Boolean));
