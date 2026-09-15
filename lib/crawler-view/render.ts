/**
 * The second pass: what a crawler that *does* run JavaScript sees, the way
 * Googlebot's renderer works. fetch.ts answers "what does a plain GET
 * return"; this answers "what does the DOM look like after the page's own
 * scripts have run against it."
 *
 * Reuses extract() on the rendered HTML so both passes report the same
 * shape of numbers (word count, text ratio, structured data, directives) —
 * the only difference is whether JavaScript ran first.
 *
 * SSRF posture: this drives a real browser, which resolves and connects to
 * hosts on its own — Node's `lookup` hook in fetch.ts has no reach into
 * Chromium's network stack. The equivalent guard here is request
 * interception: every request the page makes (the navigation itself, every
 * redirect, every subresource) is intercepted, its hostname is resolved and
 * checked against the same isBlockedIp() blocklist fetch.ts uses, and only
 * then allowed through. That closes the same hole fetch.ts closes (a
 * private-range target, direct or via redirect) and additionally covers
 * subresources a plain fetch never touches. It does not fully close DNS
 * rebinding between the check and Chromium's own connect — no CDP hook
 * pins a resolved IP for an arbitrary set of runtime-discovered hostnames
 * without reimplementing DNS inside Chromium — but the window is the same
 * shape and size as the one fetch.ts already accepts (resolve, check, then
 * hand off to a lower-level client), not a wider one.
 */
import fs from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import type { Browser } from "puppeteer-core";
import { isBlockedIp } from "./fetch";
import { extract, type Extraction } from "./extract";

const NAV_TIMEOUT_MS = 20_000;
const SETTLE_TIMEOUT_MS = 4_000;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter((p): p is string => Boolean(p));

function findChrome(): string {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chromium found. Install chromium (or chromium-browser / google-chrome), or set CHROME_PATH to its binary.",
  );
}

async function hostAllowed(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (net.isIP(bare)) return !isBlockedIp(bare);
  try {
    const records = await dns.lookup(bare, { all: true });
    return records.length > 0 && records.every((r) => !isBlockedIp(r.address));
  } catch {
    return false;
  }
}

export type RenderOutcome =
  | { ok: true; extraction: Extraction; finalUrl: string; elapsedMs: number }
  | { ok: false; error: string };

export async function renderPage(input: string): Promise<RenderOutcome> {
  const started = Date.now();

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "That does not look like a URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs can be rendered." };
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") {
    return { ok: false, error: "Only ports 80 and 443 can be rendered." };
  }

  let executablePath: string;
  try {
    executablePath = findChrome();
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  // Imported lazily: puppeteer-core touches the filesystem/env at import
  // time to locate its own bundled type/protocol data, which is unnecessary
  // cost for every request that only ever uses the raw-fetch path.
  const puppeteer = (await import("puppeteer-core")).default;

  let browser: Browser | null = null;
  let blockedRequest = false;

  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    );
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);

    let mainDocumentHeaders: Record<string, string> = {};
    page.on("response", (res) => {
      if (res.request().resourceType() === "document" && res.frame() === page.mainFrame()) {
        mainDocumentHeaders = res.headers();
      }
    });

    page.on("request", (req) => {
      void (async () => {
        let reqUrl: URL;
        try {
          reqUrl = new URL(req.url());
        } catch {
          blockedRequest = true;
          await req.abort().catch(() => {});
          return;
        }
        if (reqUrl.protocol === "data:" || reqUrl.protocol === "blob:") {
          await req.continue().catch(() => {});
          return;
        }
        if (reqUrl.protocol !== "http:" && reqUrl.protocol !== "https:") {
          blockedRequest = true;
          await req.abort().catch(() => {});
          return;
        }
        const allowed = await hostAllowed(reqUrl.hostname);
        if (!allowed) {
          blockedRequest = true;
          await req.abort().catch(() => {});
          return;
        }
        await req.continue().catch(() => {});
      })();
    });

    try {
      await page.goto(url.toString(), {
        waitUntil: "networkidle2",
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (navError) {
      // A page that never goes network-idle (polling, websockets, analytics
      // beacons) still has a usable DOM by this point — only bail out here
      // if nothing rendered at all (bad host, connection refused, etc).
      const isTimeout =
        navError instanceof Error && navError.name === "TimeoutError";
      if (!isTimeout) throw navError;
    }

    // One more short, best-effort wait past the initial settle for content
    // that mounts a beat after networkidle2 fires (common with SPA routers).
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: SETTLE_TIMEOUT_MS })
      .catch(() => {});

    if (blockedRequest && page.url() === "about:blank") {
      return { ok: false, error: "That address is not routable from here." };
    }

    const html = await page.content();
    const finalUrl = page.url();

    return {
      ok: true,
      extraction: extract(html, mainDocumentHeaders),
      finalUrl,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    if (blockedRequest) {
      return { ok: false, error: "That address is not routable from here." };
    }
    const message = error instanceof Error ? error.message : "Rendering failed.";
    return { ok: false, error: message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
