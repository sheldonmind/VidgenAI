import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import prisma from "../prisma";

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS === "true";
const CDP_URL = process.env.TIKTOK_CHROME_CDP_URL;
// Fixed path: always BE/.playwright-tiktok-profile so same profile is used whether server runs from BE or repo root
const USER_DATA_DIR = path.join(__dirname, "..", "..", ".playwright-tiktok-profile");

export type VisitResult = {
  success: boolean;
  error?: string;
  accountUrl?: string;
  openedVideoUrl?: string;
  downloadedVideoPath?: string;
  downloadedVideoFilename?: string;
};

/**
 * Visit a TikTok account page with Playwright, extract video links, save to DB.
 * If TIKTOK_CHROME_CDP_URL is set, connects to your normal Chrome (already logged in).
 * Otherwise launches Chromium/Chrome with a dedicated profile.
 */
export async function visitTikTokAccountAndGetVideos(accountUrl: string): Promise<VisitResult> {
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  const useCDP = !!CDP_URL?.trim();

  try {
    const normalizedUrl = accountUrl.startsWith("http") ? accountUrl : `https://www.tiktok.com/${accountUrl.replace(/^@/, "")}`;

    let page;
    let downloadedVideoPath: string | undefined;
    let downloadedVideoFilename: string | undefined;

    if (useCDP) {
      try {
        browser = await chromium.connectOverCDP(CDP_URL!);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // Common case on macOS: Chrome wasn't started with --remote-debugging-port, or it started without listening on IPv4.
        if (msg.includes("ECONNREFUSED")) {
          throw new Error(
            [
              `Cannot connect to Chrome DevTools at ${CDP_URL}.`,
              "This means Chrome is NOT running with remote debugging enabled.",
              "",
              "Fix (macOS):",
              "1) Quit ALL Chrome windows (Cmd+Q). Make sure no 'Google Chrome' process is running.",
              '2) Start Chrome with: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --profile-directory="Default"',
              "3) Set in BE/.env: TIKTOK_CHROME_CDP_URL=http://127.0.0.1:9222",
              "4) Restart BE, then click Visit account again.",
              "",
              "If you don't want to use your current Chrome, remove TIKTOK_CHROME_CDP_URL and the app will open a separate browser profile instead.",
            ].join("\n")
          );
        }
        throw e;
      }
      const defaultContext = browser.contexts()[0];
      context = defaultContext as unknown as typeof context;
      page = defaultContext.pages()[0] || (await defaultContext.newPage());
    } else {
      context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: HEADLESS,
        channel: process.env.PLAYWRIGHT_USE_CHROME === "true" ? "chrome" : "chromium",
        viewport: { width: 1280, height: 800 },
        args: ["--no-sandbox"],
        acceptDownloads: true,
      });
      page = context.pages()[0] || (await context.newPage());
    }

    await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for profile/video content to appear
    await page.waitForSelector('[data-e2e="user-post-item"], [data-e2e="user-post-item-desc"], a[href*="/video/"]', { timeout: 15000 }).catch(() => {});

    // Extract username from URL or page
    let username: string | null = null;
    const match = normalizedUrl.match(/tiktok\.com\/@?([^/?]+)/);
    if (match) username = match[1];

    // Collect video URLs from the profile grid (links to /video/...)
    // TikTok sometimes lazy-loads the grid; do a small scroll + retry once.
    const collectVideoLinks = async () => {
      return await page.$$eval('a[href*="/video/"]', (links) =>
        [...new Set(links.map((a) => (a as HTMLAnchorElement).href).filter(Boolean))]
      );
    };

    let videoLinks = await collectVideoLinks();
    if (!videoLinks.length) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(800);
      videoLinks = await collectVideoLinks();
    }

    // Open a random video from the channel (if available)
    let openedVideoUrl: string | undefined;
    if (videoLinks.length) {
      openedVideoUrl = videoLinks[Math.floor(Math.random() * videoLinks.length)];
      await page.goto(openedVideoUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Wait for video page UI to appear (best-effort; selectors vary by locale/variant)
      await page
        .waitForSelector('video, [data-e2e="browse-video"], [data-e2e="video-player"]', { timeout: 15000 })
        .catch(() => {});

      // Right-click on the video (as requested)
      // Prefer the <video> element; if not present, fall back to common player containers.
      const videoLocator = page.locator("video").first();
      const hasVideoTag = (await videoLocator.count()) > 0;

      // Prepare to capture a download if clicking "Download video" triggers one.
      // Note: on CDP-connected Chrome contexts, downloads may not be capturable/savable depending on Chrome settings.
      const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);

      if (hasVideoTag) {
        await videoLocator.scrollIntoViewIfNeeded().catch(() => {});
        await videoLocator.click({ button: "right", timeout: 15000 }).catch(() => {});
      } else {
        const playerLocator = page
          .locator('[data-e2e="browse-video"], [data-e2e="video-player"], [class*="DivVideoContainer"], [class*="DivPlayerContainer"]')
          .first();
        await playerLocator.scrollIntoViewIfNeeded().catch(() => {});
        await playerLocator.click({ button: "right", timeout: 15000 }).catch(() => {});
      }

      // Click "Download video" from TikTok's custom context menu (best-effort).
      // Support both English and Vietnamese labels. We try role-based first, then text-based.
      const downloadMenuCandidates = [
        page.getByRole("menuitem", { name: /download video/i }).first(),
        page.getByRole("menuitem", { name: /tải video/i }).first(),
        page.getByText(/^Download video$/i).first(),
        page.getByText(/^Tải video xuống$/i).first(),
      ];

      for (const candidate of downloadMenuCandidates) {
        try {
          if (await candidate.isVisible({ timeout: 1500 })) {
            await candidate.click({ timeout: 15000 });
            break;
          }
        } catch {
          // try next candidate
        }
      }

      const download = await downloadPromise;
      if (download) {
        downloadedVideoFilename = download.suggestedFilename();
        const downloadsDir = path.join(__dirname, "..", "..", "downloads");
        if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
        downloadedVideoPath = path.join(downloadsDir, downloadedVideoFilename);
        await download.saveAs(downloadedVideoPath).catch(() => {});
      }
    }

    const videosJson = JSON.stringify(videoLinks);

    await prisma.tikTokAccountVisit.create({
      data: {
        accountUrl: normalizedUrl,
        username,
        videos: videosJson,
      },
    });

    if (useCDP && browser) {
      await browser.close();
    }
    return {
      success: true,
      accountUrl: normalizedUrl,
      openedVideoUrl,
      downloadedVideoPath,
      downloadedVideoFilename,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (useCDP && browser) await browser.close().catch(() => {});
    else if (context) await context.close().catch(() => {});
    return { success: false, error: message, accountUrl };
  }
}
