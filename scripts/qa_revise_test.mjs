import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_qa_20260706/shots";
const browser = await puppeteer.launch({ executablePath: CHROME, headless:"new", args:["--no-sandbox","--window-size=1400,1800"] });
const page = await browser.newPage();
await page.setViewport({ width:1400, height:1800 });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function clickHandle(text){ const h=await page.evaluateHandle(t=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes(t));return b||null;},text); const el=h.asElement(); if(!el) throw new Error("no btn:"+text); await el.click(); return true; }
await page.goto(`${BASE}/login`,{waitUntil:"networkidle0"});
await page.type('input[name="email"]',"admin@blogstudio.local");
await page.type('input[name="password"]',"studio1234!");
await Promise.all([page.click('button[type="submit"]'),page.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await page.goto(`${BASE}/queue/qa_d_03_review_short`,{waitUntil:"networkidle0"});
await sleep(1200);
const before = await page.evaluate(()=>{const m=document.body.innerText.match(/(\d+)자/);return m?m[1]:'?';});
await clickHandle("반려 + AI 재작성 요청"); // 패널 펼치기
await sleep(600);
// 상세 코멘트 입력
await page.type('textarea', "내용이 너무 짧습니다. 시설과 트레이너 강점을 넣어 1500자 이상으로 풍부하게 늘려주세요.");
await sleep(300);
await page.screenshot({ path:`${OUT}/18_reject_panel.png`, fullPage:true });
await clickHandle("피드백 보내고 다시 쓰기");
// 최대 60초 대기
const t0=Date.now(); let done=false;
while(Date.now()-t0<60000){ await sleep(2500); const err=await page.evaluate(()=>{const p=[...document.querySelectorAll('div')].map(d=>d.textContent).find(x=>x&&/실패|API 키|크레딧|처리하지 못/.test(x));return p||'';}); const busy=await page.evaluate(()=>/재작성 중/.test(document.body.innerText)); if(err){console.log("revise error:",err.slice(0,80));done=true;break;} if(!busy){ const rev=await page.evaluate(()=>{const m=document.body.innerText.match(/(\d+)차 수정본/);return m?m[0]:'';}); if(rev){console.log("revise done, badge:",rev);done=true;break;} } }
await sleep(1500);
await page.screenshot({ path:`${OUT}/19_after_revise.png`, fullPage:true });
console.log("before chars:", before, "| finished:", done);
await browser.close();
