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
await p.goto(`${BASE}/blogs/${BLOG}`,{waitUntil:"networkidle0"});
await sleep(4000);
async function clickExact(t){const box=await p.evaluate((t)=>{const el=[...document.querySelectorAll('button[type="button"]')].find(b=>b.textContent.replace(/\s+/g," ").trim()===t);if(!el)return null;el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}},t);if(!box)throw new Error("no "+t);await p.mouse.click(box.x,box.y);await sleep(500);}
// 친근체(informal) + 남성 gender + 적극(L3)
await clickExact("친근체");
await p.select('select[name="gender"]',"male"); await sleep(500);
await clickExact("적극 (후기·브이로그)");
await sleep(600);
const st=await p.evaluate(()=>({formality:document.querySelector('input[name="formality"]')?.value,gender:document.querySelector('select[name="gender"]')?.value,emoji:document.querySelector('input[name="emojiIntensity"]')?.value,warn:document.querySelector('[role="alert"]')?.textContent.trim()??null}));
console.log("남성톤+친근체+적극(L3):", JSON.stringify(st));
// screenshot
const box=await p.evaluate(()=>{const lab=[...document.querySelectorAll("label")].find(e=>e.textContent.replace(/\s+/g," ").trim()==="이모지 강도");lab.parentElement.scrollIntoView({block:"center"});const r=lab.parentElement.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
await sleep(300);
await p.screenshot({path:"output/emoji_warn/E_male_L3.png",clip:{x:Math.max(0,box.x-10),y:Math.max(0,box.y-10),width:Math.min(1000,box.w+20),height:box.h+24}});
console.log("MALE PASS:", st.gender==="male"&&st.formality==="informal"&&st.emoji==="3"&&!!st.warn);
await b.close();
