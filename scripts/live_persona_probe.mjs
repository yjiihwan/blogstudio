import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://blogstudio-ide.asia";
const EMAIL = "admin@blogstudio.local", PW = "studio1234!";
const BLOGS = ["blog_seoul_life", "blog_grillbox_hq", "SRNneUDofXRMhC--"];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PW);
await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle0" }).catch(()=>{})]);

for (const id of BLOGS) {
  await page.goto(`${BASE}/blogs/${id}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const info = await page.evaluate(() => {
    const val = (n) => { const e = document.querySelector(`[name="${n}"]`); return e ? (e.value||"").trim().slice(0,60) : "(no field)"; };
    return {
      purpose: val("purpose"), audience: val("audience"), brandVoice: val("brandVoice"),
      lenMin: val("preferredLengthMin"), lenMax: val("preferredLengthMax"),
      bodyLen: document.body.innerText.length,
    };
  });
  console.log(`\n### ${id}`);
  console.log(JSON.stringify(info, null, 1));
}
await browser.close();
