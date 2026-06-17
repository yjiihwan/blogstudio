import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3001";
const OUT = "/Users/ideagent/shared_inbox/results";
const log = (...a) => console.log("[E2E]", ...a);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1280,1400"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1400 });

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

// 1) login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', "admin@blogstudio.local");
await page.type('input[name="password"]', "studio1234!");
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
]);
log("after login url:", page.url());

// ---------- ACCOUNT telegram save ----------
await page.goto(`${BASE}/account`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/fix_account_before.png`, fullPage: true });

const TEST_CHATID = "999000111";
await page.evaluate(() => {
  const i = document.querySelector('input[placeholder^="예:"]');
  if (i) { i.value = ""; }
});
await page.type('input[placeholder^="예:"]', TEST_CHATID);
// click the 저장/변경 submit in the telegram form
const accClicked = await page.evaluate(() => {
  const forms = [...document.querySelectorAll("form")];
  const tf = forms.find((f) => f.querySelector('input[placeholder^="예:"]'));
  const btn = tf?.querySelector('button[type="submit"]');
  if (btn) { btn.click(); return btn.textContent.trim(); }
  return null;
});
log("account save btn clicked text:", accClicked);
await new Promise((r) => setTimeout(r, 1500));
const accMsg = await page.evaluate(() =>
  [...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => /Chat ID가 저장|입력해|오류/.test(t)) || null
);
log("account result msg:", accMsg);
await page.screenshot({ path: `${OUT}/fix_account_after.png`, fullPage: true });

// ---------- SETTINGS api key save (fix target) ----------
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${OUT}/fix_settings_before.png`, fullPage: true });

const TEST_KEY = "sk-ant-api03-E2E-TEST-DO-NOT-USE-0000";
await page.evaluate((v) => {
  const i = document.querySelector("#apiKey");
  if (i) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(i, v);
    i.dispatchEvent(new Event("input", { bubbles: true }));
  }
}, TEST_KEY);
const setClicked = await page.evaluate(() => {
  const i = document.querySelector("#apiKey");
  const form = i?.closest("form");
  const btn = [...(form?.querySelectorAll('button[type="submit"]') || [])][0];
  if (btn) { btn.click(); return btn.textContent.trim(); }
  return null;
});
log("settings save btn clicked text:", setClicked);
await new Promise((r) => setTimeout(r, 2000));
const setMsg = await page.evaluate(() =>
  [...document.querySelectorAll("span,p")].map((e) => e.textContent).find((t) => /저장됨|오류|올바른|형식/.test(t)) || null
);
log("settings save result msg:", setMsg);
await page.screenshot({ path: `${OUT}/fix_settings_after.png`, fullPage: true });

// reload to confirm persistence/reload of masked value
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
const maskedAfterReload = await page.evaluate(() => {
  const i = document.querySelector("#apiKey");
  const form = i?.closest("form");
  const p = form?.querySelector("p.font-mono");
  return p?.textContent?.trim() || null;
});
log("settings masked after reload:", maskedAfterReload);

log("CONSOLE ERRORS:", consoleErrors.length ? consoleErrors : "none");
await browser.close();
log("DONE");
