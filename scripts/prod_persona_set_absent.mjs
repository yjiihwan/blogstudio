import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE="https://blogstudio-ide.asia"; const BLOG="8LIIM2FAcbYfu6gk";
const OUT="/Users/ideagent/shared_inbox/results/blogstudio_hallucination_guard_prod_20260707/shots";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ABSENT=["클래스","그룹수업","그룹","강사","PT프로그램"];
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox","--window-size=1400,2200"]});
const p=await b.newPage(); await p.setViewport({width:1400,height:2200});
await p.goto(`${BASE}/login`,{waitUntil:"networkidle0"});
await p.type('input[name="email"]',"admin@blogstudio.local");
await p.type('input[name="password"]',"studio1234!");
await Promise.all([p.click('button[type="submit"]'),p.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await p.goto(`${BASE}/blogs/${BLOG}`,{waitUntil:"networkidle0"});
await sleep(3500); // hydration
// focus absent chip input via placeholder
const inp = await p.evaluateHandle(()=>[...document.querySelectorAll('input')].find(i=>/수영장.*사우나|수영, 사우나/.test(i.getAttribute('placeholder')||"")) || [...document.querySelectorAll('input')].find(i=>/스파.*골프|사우나/.test(i.getAttribute('placeholder')||"")));
const found = await p.evaluate(el=>!!el, inp);
if(!found){ console.log("ABSENT INPUT NOT FOUND"); await b.close(); process.exit(1); }
await inp.click();
for(const t of ABSENT){ await inp.type(t); await p.keyboard.press("Enter"); await sleep(250); }
await sleep(400);
const chips=await p.evaluate(()=>[...document.querySelectorAll('input[type=hidden][name=absentFacilities]')].map(i=>i.value));
console.log("ABSENT chips before save:", JSON.stringify(chips));
await p.screenshot({path:`${OUT}/05_persona_absent.png`,fullPage:true});
// save via trusted click on 변경사항 저장
const btn=await p.evaluateHandle(()=>[...document.querySelectorAll('button[type="submit"]')].find(x=>/변경사항 저장/.test(x.innerText)));
await p.evaluate(el=>el.scrollIntoView({block:"center"}), btn);
await sleep(400); await btn.click();
await sleep(6000);
console.log("after save url:", p.url());
// re-read to confirm persisted
await p.goto(`${BASE}/blogs/${BLOG}`,{waitUntil:"networkidle0"}); await sleep(1500);
const persisted=await p.evaluate(()=>[...document.querySelectorAll('input[type=hidden][name=absentFacilities]')].map(i=>i.value));
console.log("ABSENT persisted (reloaded):", JSON.stringify(persisted));
await b.close();
