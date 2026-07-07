import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_qa_20260706/shots";
const browser = await puppeteer.launch({ executablePath: CHROME, headless:"new", args:["--no-sandbox","--window-size=1400,1800"] });
const page = await browser.newPage();
await page.setViewport({ width:1400, height:1800 });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await page.goto(`${BASE}/login`,{waitUntil:"networkidle0"});
await page.type('input[name="email"]',"admin@blogstudio.local");
await page.type('input[name="password"]',"studio1234!");
await Promise.all([page.click('button[type="submit"]'),page.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await page.goto(`${BASE}/queue/new`,{waitUntil:"networkidle0"});
await sleep(1000);
await page.screenshot({ path:`${OUT}/16_generate_list.png`, fullPage:true });
// QA 블로그 폼의 생성 버튼 클릭
const clicked = await page.evaluate(()=>{
  const form=[...document.querySelectorAll('form')].find(f=>{const i=f.querySelector('input[name="blogId"]'); return i&&i.value==='qa_blog_ngym';});
  if(!form) return false;
  const btn=form.querySelector('button[type="submit"]');
  if(!btn) return false;
  btn.click(); return true;
});
console.log("generate clicked:", clicked);
const t0=Date.now();
let outcome="timeout";
// 최대 90초 대기: 새 초안으로 리다이렉트되거나, error/needsInfo 메시지 노출
while(Date.now()-t0 < 90000){
  await sleep(2000);
  const url=page.url();
  if(/\/queue\/[A-Za-z0-9_-]{6,}$/.test(url) && !url.endsWith('/new')){ outcome="redirected:"+url.split('/').pop(); break; }
  const info=await page.evaluate(()=>{
    const err=[...document.querySelectorAll('p')].map(p=>p.textContent).find(x=>x&&(/실패|API 키|크레딧|혼잡|권한/.test(x)));
    const need=[...document.querySelectorAll('p,div')].map(p=>p.textContent).find(x=>x&&/추가 정보를 적어|정보 반영해/.test(x));
    return {err, need};
  });
  if(info.err){ outcome="error:"+info.err.slice(0,80); break; }
  if(info.need){ outcome="needsInfo"; break; }
}
console.log("outcome:", outcome, "elapsed:", ((Date.now()-t0)/1000|0)+"s");
await page.screenshot({ path:`${OUT}/17_generate_result.png`, fullPage:true });
await browser.close();
