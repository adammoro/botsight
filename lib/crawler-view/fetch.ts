import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

/**
 * Fetching URLs supplied by strangers is server-side request forgery waiting to
 * happen. The defenses here, in order of how much they matter:
 *
 *   1. Address validation runs in the `lookup` hook, so it happens at connect
 *      time. Resolving first and then handing the hostname to a client leaves a
 *      window where DNS can change answer between the check and the connection.
 *   2. Every redirect hop is re-validated. One permitted host redirecting to
 *      169.254.169.254 is the classic way in.
 *   3. Only http and https, only ports 80 and 443.
 *   4. Hard caps on time and response size.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, and the cloud metadata endpoint
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/**
 * Expand an IPv6 address to its 16 bytes.
 *
 * Necessary because the URL parser rewrites `::ffff:127.0.0.1` as
 * `::ffff:7f00:1`. Pattern-matching the text form misses the loopback address
 * hiding in the hex, so the address has to be decoded before it is judged.
 */
function ipv6Bytes(input: string): number[] | null {
  let text = input.split("%")[0].toLowerCase();
  const trailingV4: string[] = [];

  const dotted = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = dotted[1].split(".").map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    trailingV4.push(
      (((octets[0] << 8) | octets[1]) >>> 0).toString(16),
      (((octets[2] << 8) | octets[3]) >>> 0).toString(16),
    );
    text = text.slice(0, dotted.index);
  }

  const compressed = text.includes("::");
  const [leftPart, rightPart = ""] = text.split("::");
  const pieces = (part: string) => part.split(":").filter(Boolean);

  const head = pieces(leftPart);
  const tail = [...pieces(rightPart), ...trailingV4];

  let groups: string[];
  if (compressed) {
    const gap = 8 - head.length - tail.length;
    if (gap < 0) return null;
    groups = [...head, ...Array<string>(gap).fill("0"), ...tail];
  } else {
    groups = [...head, ...tail];
    if (groups.length !== 8) return null;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    const value = parseInt(group, 16);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null;
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function isBlockedV6(ip: string): boolean {
  const b = ipv6Bytes(ip);
  if (!b) return true; // undecodable means untrusted

  const zerosUpTo = (n: number) => b.slice(0, n).every((x) => x === 0);
  const embeddedV4 = () => isBlockedV4(b.slice(12).join("."));

  if (b.every((x) => x === 0)) return true; // ::
  if (zerosUpTo(15) && b[15] === 1) return true; // ::1
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  if (b[0] === 0x20 && b[1] === 0x02) return true; // 2002::/16 6to4

  // Anything carrying a v4 address is only as safe as that address.
  if (zerosUpTo(10) && b[10] === 0xff && b[11] === 0xff) return embeddedV4();
  if (zerosUpTo(12)) return embeddedV4();
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return embeddedV4(); // 64:ff9b::/96 NAT64
  }

  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  if (net.isIPv6(ip)) return isBlockedV6(ip);
  return true;
}

/** A dns.lookup that refuses to resolve anything pointing somewhere private. */
const guardedLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, ...rest: never[]) => void,
) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    const done = callback as unknown as (
      err: NodeJS.ErrnoException | null,
      address?: unknown,
      family?: number,
    ) => void;

    if (err) return done(err);

    const list = Array.isArray(addresses) ? addresses : [addresses];
    const blocked = list.find((entry) => isBlockedIp(entry.address));
    if (blocked) {
      return done(
        Object.assign(
          new Error(
            `${hostname} resolves to a private address (${blocked.address})`,
          ),
          { code: "EBLOCKED" },
        ),
      );
    }

    if (options?.all) return done(null, list);
    done(null, list[0].address, list[0].family);
  });
}) as unknown as typeof dns.lookup;

export function validateUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("That does not look like a URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be checked.");
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") {
    throw new Error("Only ports 80 and 443 can be checked.");
  }
  // WHATWG URL keeps the brackets on IPv6 hosts, and net.isIP("[::1]") is 0.
  // Literal addresses never reach the DNS guard, so missing this check would
  // leave them entirely unvalidated.
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (net.isIP(host) && isBlockedIp(host)) {
    throw new Error("That address is not routable from here.");
  }
  return url;
}

export type FetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  redirects: string[];
  elapsedMs: number;
};

export type FetchOutcome =
  | { ok: true; result: FetchResult }
  | { ok: false; error: string };

function once(url: URL, ua: string): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  location?: string;
}> {
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        headers: {
          "user-agent": ua,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("close", () => {
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
            location: headers.location,
          });
        });
        res.on("error", reject);
      },
    );

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`No response within ${TIMEOUT_MS / 1000}s.`));
    });
    req.on("error", reject);
    req.end();
  });
}

/** GET a URL as a given user agent, revalidating every redirect hop. */
export async function fetchAs(
  input: string | URL,
  ua: string,
): Promise<FetchOutcome> {
  const started = Date.now();
  const redirects: string[] = [];

  try {
    let url = input instanceof URL ? input : validateUrl(input);
    const original = url.toString();

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await once(url, ua);
      const isRedirect =
        res.status >= 300 && res.status < 400 && res.location !== undefined;

      if (!isRedirect || hop === MAX_REDIRECTS) {
        return {
          ok: true,
          result: {
            url: original,
            finalUrl: url.toString(),
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
            body: res.body,
            truncated: res.truncated,
            redirects,
            elapsedMs: Date.now() - started,
          },
        };
      }

      // Re-validate: a permitted host redirecting inward is the usual attack.
      const next = validateUrl(new URL(res.location!, url).toString());
      redirects.push(next.toString());
      url = next;
    }

    return { ok: false, error: "Too many redirects." };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach that URL.";
    return { ok: false, error: message };
  }
}
