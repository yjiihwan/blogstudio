import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "/Users/ideagent/banner_work";
const admin = fs.readFileSync("/tmp/blog_admin.jwt", "utf-8").trim();

type Shot = {
  name: string;
  url: string;
  w: number;
  h: number;
  cookie?: string;
  fullPage?: boolean;
};

const shots: Shot[] = JSON.parse(process.env.SHOTS ?? "null") ?? [
  { name: "blog_login_desktop", url: `${BASE}/login`, w: 1440, h: 900 },
  { name: "blog_dashboard", url: `${BASE}/dashboard`, w: 1440, h: 900, cookie: admin, fullPage: true },
];

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  });
  try {
    for (const s of shots) {
      const page = await browser.newPage();
      await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
      if (s.cookie) {
        await page.setCookie({
          name: "bs_session",
          value: s.cookie,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        });
      }
      try {
        await page.goto(s.url, {
          waitUntil: "networkidle0",
          timeout: 30_000,
        });
        await page.evaluate(() => (document as any).fonts?.ready ?? null);
        await new Promise((r) => setTimeout(r, 500));
        const out = path.join(OUT, `blog_studio_${s.name}.png`);
        await page.screenshot({ path: out as `${string}.png`, fullPage: !!s.fullPage });
        console.log("Saved:", out);
      } catch (e) {
        console.error("Failed:", s.name, (e as Error).message);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
