import puppeteer from "puppeteer-core";
import fs from "node:fs";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE="https://blogstudio-ide.asia"; const BLOG="SRNneUDofXRMhC--";
const OUT="/tmp/bs_gen_timing"; fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BRIEF="엔짐 영등포점에서 여름을 앞두고 3개월 다이어트 PT 프로그램을 진행하고 있습니다. 프리미엄 피트니스 시설에서 전문 트레이너와 함께하는 체계적인 PT의 장점, 여름 대비 다이어트를 시작하려는 분들을 위한 안내, 시설의 프리미엄한 분위기와 1:1 맞춤 관리 방식을 소개하는 블로그 글. 톤은 프리미엄·정중하면서 친근하게. 공백 제외 2300자 내외로 충실히 작성하되, 가격·할인율·수상·순위·회원수·만족도·감량 kg 같은 확인 불가한 구체 수치나 실적은 절대 쓰지 말고 일반적인 안내와 분위기·프로그램 특징 중심으로 풀어줘.";
async function launch(){for(let i=0;i<6;i++){try{return await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--window-size=1400,2600"]});}catch(e){console.log("launch retry",i,e.message?.slice(0,60));await sleep(3000);}}throw new Error("launch failed");}
const b=await launch();
const p=await b.newPage(); await p.setViewport({width:1400,height:2600});
await p.goto(`${BASE}/login`,{waitUntil:"networkidle0"});
await p.type('input[name="email"]',"admin@blogstudio.local");
await p.type('input[name="password"]',"studio1234!");
await Promise.all([p.click('button[type="submit"]'),p.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await sleep(500);
await p.goto(`${BASE}/queue/new/manual?blogId=${BLOG}`,{waitUntil:"networkidle0"});
await sleep(3500);
await p.type('input[name="title"]',"엔짐 영등포점 여름 다이어트 PT 안내");
await p.type('textarea[name="brief"]',BRIEF);
const kw=await p.$('input[name="keywords"]'); if(kw) await kw.type("엔짐 영등포점, 영등포 헬스장, 다이어트 PT");
const btn=await p.evaluateHandle(()=>[...document.querySelectorAll('button[type="submit"]')].find(x=>/초안 생성/.test(x.innerText)));
await p.evaluate(el=>el.scrollIntoView({block:"center"}), btn);
await sleep(400);
const t0=Date.now(); await btn.click();
let intercept=false; for(let i=0;i<6;i++){await sleep(300); if(/생성 중/.test(await p.evaluate(()=>document.body.innerText))){intercept=true;break;}}
console.log("react intercept:",intercept);
let url="", outcome="timeout", elapsed=0;
for(let i=0;i<75;i++){ // up to 300s
  await sleep(4000); url=p.url(); elapsed=((Date.now()-t0)/1000)|0;
  if(/\/queue\/[A-Za-z0-9]{6,}$/.test(url)){ outcome="draft"; break; }
  const txt=await p.evaluate(()=>document.body.innerText);
  if(/실패|타임아웃|timeout|오류|502|504|Application error|크레딧/i.test(txt) && !/생성 중/.test(txt)){ outcome="error"; break; }
}
console.log("OUTCOME:",outcome,"ELAPSED:",elapsed+"s","URL:",url);
await sleep(1500);
await p.screenshot({path:`${OUT}/draft.png`,fullPage:true});
let body=await p.evaluate(()=>{const ta=[...document.querySelectorAll('textarea')].map(t=>t.value).filter(v=>v&&v.length>200).sort((a,b)=>b.length-a.length)[0];return ta||"";});
if(!body){ await p.evaluate(()=>{const e=[...document.querySelectorAll('button')].find(x=>/편집/.test(x.innerText)); e&&e.click();}); await sleep(800);
  body=await p.evaluate(()=>{const ta=[...document.querySelectorAll('textarea')].map(t=>t.value).filter(v=>v&&v.length>200).sort((a,b)=>b.length-a.length)[0];return ta||"";}); }
fs.writeFileSync(`${OUT}/body.md`,body||"");
fs.writeFileSync(`${OUT}/pagetext.txt`,await p.evaluate(()=>document.body.innerText));
console.log("BODY_LEN:",(body||"").length);
await b.close();
