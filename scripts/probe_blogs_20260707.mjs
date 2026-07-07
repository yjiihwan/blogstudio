import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);
await sleep(800);
await page.goto(`${BASE}/queue/new`, { waitUntil: "networkidle0" });
await sleep(600);
// list blogs and their generate forms
const info = await page.evaluate(() => {
  const forms = [...document.querySelectorAll("form")];
  const blogs = forms.map(f => {
    const blogId = f.querySelector('input[name="blogId"]')?.value;
    const hasGen = /초안 생성/.test(f.innerText || "");
    // nearest heading/name text
    let card = f.closest("li,article,div");
    const name = (card?.innerText || "").split("\n").slice(0,3).join(" | ").slice(0,80);
    return { blogId, hasGen, name };
  }).filter(b => b.blogId);
  return { count: blogs.length, blogs };
});
console.log(JSON.stringify(info, null, 2));
// Also list published/draft bodies to inspect an already-generated one
await page.goto(`${BASE}/blogs`, { waitUntil: "networkidle0" }).catch(()=>{});
await sleep(500);
const blogsPage = await page.evaluate(() => (document.body.innerText||"").slice(0,500));
console.log("=== /blogs ===\n", blogsPage);
await browser.close();
