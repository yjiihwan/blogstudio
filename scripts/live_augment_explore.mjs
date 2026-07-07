import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const OUT = "/Users/ideagent/shared_inbox/results/blogstudio_augment_deploy_20260705";
const EMAIL = process.env.ADMIN_EMAIL || "admin@blogstudio.local";
const PW = process.env.ADMIN_PASSWORD || "studio1234!";

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--window-size=1360,1700"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 1700 });
page.on("console", (m) => { if (m.type() === "error") console.log("[browser-err]", m.text()); });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PW);
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
console.log("[after-login]", page.url());

// 블로그 목록
await page.goto(`${BASE}/blogs`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${OUT}/explore_blogs.png`, fullPage: true });
const blogs = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href*="/blogs/"], a[href*="/queue"]')];
  return links.map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim().slice(0, 40) })).slice(0, 40);
});
console.log("[blogs-links]", JSON.stringify(blogs, null, 1));

// queue/new
await page.goto(`${BASE}/queue/new`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${OUT}/explore_queue_new.png`, fullPage: true });
const formInfo = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log("[queue/new text]\n", formInfo);

await browser.close();
console.log("DONE");
