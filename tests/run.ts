// Combined test suite. Plain assertions, no framework — run with npm test.
import { parseRobots, evaluate, type RobotsStatus } from "../lib/crawler-view/robots.ts";
import { isBlockedIp, validateUrl } from "../lib/crawler-view/fetch.ts";

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`  FAIL ${name}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const txt = `
# a comment
User-agent: *
Disallow: /private/
Allow: /private/public-thing
Disallow: /*.pdf$

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
User-agent: CCBot
Disallow: /no-ai/

User-agent: Applebot
Disallow:

Sitemap: https://example.com/sitemap.xml
`;

const status: RobotsStatus = { kind: "ok", robots: parseRobots(txt) };
const allow = (t: string, p: string) => evaluate(status, t, p).allowed;

console.log("robots.txt evaluation");
check("GPTBot blocked sitewide", allow("GPTBot", "/anything"), false);
check("GPTBot blocked at root", allow("GPTBot", "/"), false);
check("ClaudeBot blocked in /no-ai/", allow("ClaudeBot", "/no-ai/x"), false);
check("ClaudeBot allowed elsewhere", allow("ClaudeBot", "/blog/post"), true);
check("CCBot shares ClaudeBot group", allow("CCBot", "/no-ai/x"), false);
check("CCBot not bound by wildcard group", allow("CCBot", "/private/x"), true);
check("unlisted bot uses wildcard", allow("PerplexityBot", "/private/x"), false);
check("Allow beats Disallow on longer match", allow("PerplexityBot", "/private/public-thing"), true);
check("unmatched path allowed", allow("PerplexityBot", "/open"), true);
check("$ anchor matches", allow("PerplexityBot", "/doc.pdf"), false);
check("$ anchor respects end", allow("PerplexityBot", "/doc.pdf?v=1"), true);
check("empty Disallow allows all", allow("Applebot", "/private/x"), true);
check("case-insensitive token", allow("gptbot", "/x"), false);
check("sitemaps parsed", parseRobots(txt).sitemaps, ["https://example.com/sitemap.xml"]);

console.log("robots.txt availability");
check("absent means allowed", evaluate({ kind: "absent", status: 404 }, "GPTBot", "/").allowed, true);
check("unreachable means disallowed", evaluate({ kind: "unreachable", detail: "x" }, "GPTBot", "/").allowed, false);

console.log("address blocking");
for (const [ip, want] of [
  ["127.0.0.1", true], ["169.254.169.254", true], ["10.0.0.1", true],
  ["192.168.1.1", true], ["172.16.0.1", true], ["172.31.255.255", true],
  ["172.32.0.1", false], ["8.8.8.8", false], ["100.64.0.1", true],
  ["0.0.0.0", true], ["224.0.0.1", true],
  ["::1", true], ["fe80::1", true], ["fc00::1", true],
  ["::ffff:127.0.0.1", true], ["2606:4700::1111", false],
] as Array<[string, boolean]>) check(`isBlockedIp(${ip})`, isBlockedIp(ip), want);

console.log("URL validation");
const rejects = (u: string) => { try { validateUrl(u); return false; } catch { return true; } };
check("rejects file://", rejects("file:///etc/passwd"), true);
check("rejects non-standard port", rejects("http://example.com:22/"), true);
check("rejects literal loopback", rejects("http://127.0.0.1/"), true);
check("rejects literal metadata IP", rejects("http://169.254.169.254/"), true);
check("rejects gopher://", rejects("gopher://example.com/"), true);
check("accepts normal https", rejects("https://example.com/a?b=c"), false);
check("accepts explicit :443", rejects("https://example.com:443/"), false);
check("rejects bracketed IPv6 loopback", rejects("http://[::1]/"), true);
check("rejects bracketed IPv4-mapped loopback", rejects("http://[::ffff:127.0.0.1]/"), true);
check("rejects bracketed link-local", rejects("http://[fe80::1]/"), true);
check("rejects bracketed unique-local", rejects("http://[fc00::1]/"), true);
check("accepts bracketed public IPv6", rejects("http://[2606:4700::1111]/"), false);
check("blocks hex-form mapped loopback", isBlockedIp("::ffff:7f00:1"), true);
check("blocks hex-form mapped private", isBlockedIp("::ffff:c0a8:1"), true);
check("blocks uncompressed mapped loopback", isBlockedIp("0:0:0:0:0:ffff:127.0.0.1"), true);
check("blocks NAT64 loopback", isBlockedIp("64:ff9b::7f00:1"), true);
check("blocks 6to4", isBlockedIp("2002::1"), true);
check("allows mapped public v4", isBlockedIp("::ffff:8.8.8.8"), false);
check("allows plain public v6", isBlockedIp("2001:4860:4860::8888"), false);
check("blocks garbage v6", isBlockedIp("::ffff:zz"), true);


import { extract, visibleText, decodeEntities } from "../lib/crawler-view/extract.ts";

function truthy(name: string, actual: boolean) { if (actual) pass++; else { fail++; console.log(`  FAIL ${name}`); } }

// --- a normal server-rendered page ---
const served = `<!doctype html><html><head>
<title>How &amp; Why We Test</title>
<meta name="description" content="A short summary.">
<link rel="canonical" href="https://example.com/post">
<meta name="robots" content="index,follow,max-snippet:-1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","author":{"@type":"Person","name":"A"}}</script>
<style>.a{color:red}</style>
</head><body>
<h1>The heading</h1>
<p>First paragraph with real words in it.</p>
<h2>A section</h2>
<p>Second paragraph &mdash; also real.</p>
<script>var secret = "SHOULD_NOT_APPEAR";</script>
</body></html>`;

const a = extract(served, { "x-robots-tag": "noarchive" });
console.log("server-rendered page");
check("title decoded", a.title, "How & Why We Test");
check("meta description", a.metaDescription, "A short summary.");
check("canonical", a.canonical, "https://example.com/post");
check("headings", a.headings, [{level:1,text:"The heading"},{level:2,text:"A section"}]);
check("json-ld types", a.structuredData.sort(), ["Article","Person"]);
check("robots meta", a.directives.robotsMeta, "index,follow,max-snippet:-1");
check("x-robots-tag from headers", a.directives.xRobotsTag, "noarchive");
check("not client rendered", a.clientRendered.likely, false);
truthy("script contents excluded", !visibleText(served).includes("SHOULD_NOT_APPEAR"));
truthy("style contents excluded", !visibleText(served).includes("color:red"));
truthy("body text present", visibleText(served).includes("First paragraph with real words"));
truthy("em dash decoded", visibleText(served).includes("—"));
truthy("word count sane", a.wordCount > 10 && a.wordCount < 40);

// --- a client-rendered shell ---
const shell = `<!doctype html><html><head><title>App</title></head><body>
<div id="root"></div>
<script>window.__NEXT_DATA__={};</script>
${"<script src='/chunk.js'></script>".repeat(30)}
${"<!-- padding -->".repeat(1200)}
</body></html>`;

const b = extract(shell, {});
console.log("client-rendered shell");
truthy("html is large", shell.length > 15000);
truthy("few words", b.wordCount < 100);
check("flagged as client rendered", b.clientRendered.likely, true);
truthy("reason: sparse text", b.clientRendered.reasons.some(r => r.includes("words in")));
truthy("reason: empty mount", b.clientRendered.reasons.some(r => r.includes("mount element")));
truthy("reason: framework markers", b.clientRendered.reasons.some(r => r.includes("framework markers")));

// --- directives and edge cases ---
console.log("directives and edges");
const c = extract(`<html><head><meta name="noai"><meta name="noimageai"></head><body>hi</body></html>`, {});
check("noai detected", c.directives.noai, true);
check("noimageai detected", c.directives.noimageai, true);
check("missing title is null", extract("<html><body>x</body></html>", {}).title, null);
check("bad json-ld noted", extract(`<script type="application/ld+json">{oops</script>`, {}).structuredData, ["(unparseable JSON-LD)"]);
check("numeric entity", decodeEntities("caf&#233;"), "café");
check("hex entity", decodeEntities("&#x2014;"), "—");
check("unknown entity untouched", decodeEntities("&weird;"), "&weird;");
check("empty html safe", extract("", {}).wordCount, 0);


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
