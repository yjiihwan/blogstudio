import puppeteer from "puppeteer-core";
import fs from "node:fs";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE="https://blogstudio-ide.asia"; const BLOG="8LIIM2FAcbYfu6gk";
const OUT="/Users/ideagent/shared_inbox/results/blogstudio_hallucination_guard_prod_20260707/shots";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BRIEF="엔짐 답십리점이 새롭게 오픈했습니다. 답십리 지역에 문을 연 프리미엄 피트니스 시설의 오픈 소식과 감사 인사, 위치(답십리), 시설의 프리미엄한 분위기와 브랜드 지향점, 방문·이용 안내를 소개하는 블로그 글. 톤은 프리미엄·정중. 공백 제외 2500자 내외(2300~2700자)로 충실히 작성하되, 가격·할인율·수상·순위·회원수·만족도 같은 확인 불가한 구체 수치나 실적은 절대 쓰지 말고 일반적인 안내와 분위기·브랜드 철학 중심으로 풀어줘.";
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--window-size=1400,2600"]});
const p=await b.newPage(); await p.setViewport({width:1400,height:2600});
await p.goto(`${BASE}/login`,{waitUntil:"networkidle0"});
await p.type('input[name="email"]',"admin@blogstudio.local");
await p.type('input[name="password"]',"studio1234!");
await Promise.all([p.click('button[type="submit"]'),p.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await sleep(500);
await p.goto(`${BASE}/queue/new/manual?blogId=${BLOG}`,{waitUntil:"networkidle0"});
await sleep(3500);
await p.type('input[name="title"]',"엔짐 답십리점 오픈 안내");
await p.type('textarea[name="brief"]',BRIEF);
const kw=await p.$('input[name="keywords"]'); if(kw) await kw.type("엔짐 답십리점, 답십리 헬스장, 오픈");
const btn=await p.evaluateHandle(()=>[...document.querySelectorAll('button[type="submit"]')].find(x=>/초안 생성/.test(x.innerText)));
await p.evaluate(el=>el.scrollIntoView({block:"center"}), btn);
await sleep(400); await btn.click();
let ok=false; for(let i=0;i<6;i++){await sleep(300); if(/생성 중/.test(await p.evaluate(()=>document.body.innerText))){ok=true;break;}}
console.log("react intercept:",ok);
let url=""; for(let i=0;i<50;i++){await sleep(4000); url=p.url(); if(/\/queue\/[A-Za-z0-9]{6,}$/.test(url)){console.log("DRAFT:",url);break;} if(/login/.test(url)&&i>1){console.log("BOUNCE");break;}}
await sleep(1500);
await p.screenshot({path:`${OUT}/07_final2_draft.png`,fullPage:true});
let body=await p.evaluate(()=>{const ta=[...document.querySelectorAll('textarea')].map(t=>t.value).filter(v=>v&&v.length>200).sort((a,b)=>b.length-a.length)[0];return ta||"";});
if(!body){ await p.evaluate(()=>{const e=[...document.querySelectorAll('button')].find(x=>/편집/.test(x.innerText)); e&&e.click();}); await sleep(800);
  body=await p.evaluate(()=>{const ta=[...document.querySelectorAll('textarea')].map(t=>t.value).filter(v=>v&&v.length>200).sort((a,b)=>b.length-a.length)[0];return ta||"";}); }
fs.writeFileSync(`${OUT}/body_final2.md`,body||"");
fs.writeFileSync(`${OUT}/pagetext_final2.txt`,await p.evaluate(()=>document.body.innerText));
console.log("FINAL_URL:",p.url(),"BODY_LEN:",(body||"").length);
await b.close();
