import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-staging.up.railway.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1400,1800"],
});
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 1800 });
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="email"]', "admin@blogstudio.local");
await p.type('input[name="password"]', "studio1234!");
await Promise.all([
  p.click('button[type="submit"]'),
  p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
await sleep(800);
console.log("AFTER_LOGIN:", p.url());

await p.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
await sleep(1200);
console.log("=== /settings ===");
console.log(await p.evaluate(() => document.body.innerText));

await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
await sleep(800);
console.log("=== /dashboard ===");
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 2500));

await b.close();
