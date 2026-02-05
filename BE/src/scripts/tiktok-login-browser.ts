/**
 * One-time TikTok login.
 * - If TIKTOK_CHROME_CDP_URL is set: opens a new tab in your normal Chrome (no "Chrome for Testing").
 * - Otherwise: opens Chromium/Chrome with a dedicated profile; log in once, then "Visit account" reuses it.
 *
 * Usage: npm run tiktok-login
 */
import "dotenv/config";
import { chromium } from "playwright";
import path from "path";
import * as readline from "readline";

const CDP_URL = process.env.TIKTOK_CHROME_CDP_URL?.trim();
const USER_DATA_DIR = path.join(__dirname, "..", "..", ".playwright-tiktok-profile");
const TIKTOK_URL = "https://www.tiktok.com";

async function main() {
  const useCDP = !!CDP_URL;

  if (useCDP) {
    console.log("Connecting to your Chrome at", CDP_URL);
    console.log("A new tab will open to TikTok. Log in there if needed, then press Enter here.\n");
  } else {
    console.log("Opening browser with profile:", USER_DATA_DIR);
    console.log("Log in to TikTok in the opened window (complete CAPTCHA if needed).");
    console.log("When done, press Enter here. The browser will stay open for you to close.\n");
  }

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;

  if (useCDP) {
    browser = await chromium.connectOverCDP(CDP_URL!);
    context = browser.contexts()[0] as unknown as typeof context;
  } else {
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      channel: process.env.PLAYWRIGHT_USE_CHROME === "true" ? "chrome" : "chromium",
      viewport: { width: 1280, height: 800 },
      args: ["--no-sandbox"],
    });
  }

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TIKTOK_URL, { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question("Press Enter when done... ", () => resolve()));
  rl.close();

  if (useCDP && browser) {
    await browser.close();
    console.log("Disconnected. Your Chrome stays open — close it yourself when done.");
  } else {
    console.log("Browser left open — close it yourself when done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
