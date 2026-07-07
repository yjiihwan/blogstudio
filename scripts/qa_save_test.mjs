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
await page.goto(`${BASE}/login`, { waitUntil:"networkidle0" });
await page.type('input[name="email"]',"admin@blogstudio.local");
await page.type('input[name="password"]',"studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await page.goto(`${BASE}/queue/qa_d_02_review_long`, { waitUntil:"networkidle0" });
await sleep(1000);
// 편집 탭 클릭
await page.evaluate(()=>{ const t=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='편집'); t&&t.click(); });
await sleep(800);
// 제목 필드에 마커 추가
const marker = " [QA수정됨]";
await page.evaluate((m)=>{
  const inp=document.querySelector('#title')||document.querySelector('input[value*="200%"]');
  if(inp){ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(inp, inp.value+m); inp.dispatchEvent(new Event('input',{bubbles:true})); }
}, marker);
await sleep(400);
await page.screenshot({ path:`${OUT}/14_edit_tab.png`, fullPage:true });
posts.length=0;
await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('변경사항 저장')); b&&b.click(); });
await sleep(2500);
await page.screenshot({ path:`${OUT}/15_after_save.png`, fullPage:true });
console.log("save POSTs:", JSON.stringify(posts));
await browser.close();
