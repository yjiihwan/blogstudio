import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_qa_20260706/shots";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox","--window-size=1400,1800"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1800 });
const posts = [];
page.on("response", r => { if (r.request().method()==="POST") posts.push(r.status()); });
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function clickHandle(text, exact=false){
  const h = await page.evaluateHandle((t,ex)=>{ const bs=[...document.querySelectorAll('button')]; return bs.find(b=>{const s=(b.textContent||'').trim(); return ex? s===t : s.includes(t);})||null; }, text, exact);
  const el=h.asElement(); if(!el) throw new Error("no btn:"+text); await el.click(); return true;
}
await page.goto(`${BASE}/login`, { waitUntil:"networkidle0" });
await page.type('input[name="email"]',"admin@blogstudio.local");
await page.type('input[name="password"]',"studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await page.goto(`${BASE}/queue/qa_d_02_review_long`, { waitUntil:"networkidle0" });
await sleep(1200);
await clickHandle("편집", true);
await sleep(800);
// 제목 필드에 마커 추가 (끝으로 이동 후 타이핑)
await page.click('#title');
await page.keyboard.down('Meta'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Meta');
await page.type('#title', ' [QA수정됨]');
await sleep(300);
await page.screenshot({ path:`${OUT}/14_edit_tab.png`, fullPage:true });
posts.length=0;
await clickHandle("변경사항 저장");
await sleep(2500);
await page.screenshot({ path:`${OUT}/15_after_save.png`, fullPage:true });
console.log("save POSTs:", JSON.stringify(posts));
await browser.close();
