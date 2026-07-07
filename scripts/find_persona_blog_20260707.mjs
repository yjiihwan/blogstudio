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
// Open an existing queue draft to learn its blogId (has persona since it generated before)
await page.goto(`${BASE}/queue`, { waitUntil: "networkidle0" });
await sleep(500);
const links = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('a[href*="/queue/"]')].map(a => a.getAttribute("href")).filter(h => h && /\/queue\/[^/]+$/.test(h) && !/\/queue\/new/.test(h)))].slice(0,3)
);
for (const href of links) {
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle0" }).catch(()=>{});
  await sleep(400);
  const meta = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const head = t.split("\n").filter(Boolean).slice(0,12).join(" | ");
    return head.slice(0,220);
  });
  console.log(href, "=>", meta, "\n");
}
// blogs list with persona/draft counts
await page.goto(`${BASE}/blogs`, { waitUntil: "networkidle0" });
await sleep(500);
const blogs = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href*="/blogs/"]')];
  return cards.map(a => ({ href: a.getAttribute("href"), text: (a.innerText||"").replace(/\n+/g," | ").slice(0,120) }));
});
console.log("=== BLOGS ===");
console.log(JSON.stringify(blogs, null, 2));
await browser.close();
