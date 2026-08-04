import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE="http://127.0.0.1:3001"; const BLOG="SRNneUDofXRMhC--";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setViewport({width:1400,height:3000});
await p.goto(`${BASE}/login`,{waitUntil:"networkidle0"});
await p.type('input[name="email"]',"admin@blogstudio.local");
await p.type('input[name="password"]',"studio1234!");
await Promise.all([p.click('button[type="submit"]'),p.waitForNavigation({waitUntil:"networkidle0"}).catch(()=>{})]);
await sleep(1500);
const resp=await p.goto(`${BASE}/blogs/${BLOG}`,{waitUntil:"networkidle0"});
console.log("nav status:", resp.status(), "url:", p.url());
await sleep(6000);
const info=await p.evaluate(()=>{
  const forms=document.querySelectorAll("form").length;
  const btns=[...document.querySelectorAll('button[type="button"]')];
  const jung=btns.filter(b=>b.textContent.replace(/\s+/g," ").trim()==="정중체");
  const fInputs=[...document.querySelectorAll('input[name="formality"]')].map(i=>i.value);
  const eInputs=[...document.querySelectorAll('input[name="emojiIntensity"]')].map(i=>i.value);
  // try clicking 정중체 and see if class changes
  let before=null, after=null;
  if(jung[0]){ before=jung[0].className.includes("bg-paper-50"); jung[0].click(); }
  return {forms, totalBtns:btns.length, jungCount:jung.length, fInputs, eInputs, beforeSel:before, hasBodyText: document.body.innerText.includes("이모지 강도")};
});
console.log("DOM:", JSON.stringify(info));
await sleep(800);
const after=await p.evaluate(()=>{
  const btns=[...document.querySelectorAll('button[type="button"]')];
  const jung=btns.find(b=>b.textContent.replace(/\s+/g," ").trim()==="정중체");
  const f=document.querySelector('input[name="formality"]')?.value;
  return {jungSelectedNow: jung? jung.className.includes("bg-paper-50"):null, formalityInput:f};
});
console.log("AFTER click:", JSON.stringify(after));
await b.close();
