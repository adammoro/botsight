# Botsight

Point it at a URL and see which AI and search engine crawlers the site's
`robots.txt` admits, whether the server actually agrees, and what a crawler
that doesn't run JavaScript really reads.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

The optional "Rendered with JavaScript" pass needs a Chromium binary on the
machine — it looks for `/usr/bin/chromium`, `/usr/bin/chromium-browser`,
`/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, or `$CHROME_PATH`
if set. Without one, everything else still works; that section just reports
the error instead of a result.

## What it reports

**Who robots.txt admits.** 29 agents evaluated and grouped by what they are
for — training, search and answer, user-triggered fetch, and the control-only
tokens that never crawl at all. That includes the traditional search engine
crawlers (Bingbot, YandexBot, Baiduspider, DuckDuckBot) alongside the AI ones,
since search visibility is as much the point here as AI visibility. Each row
shows the verdict, the rule that decided it, and whether the agent was named
explicitly or fell through to `User-agent: *`, which is usually where the
surprises are.

**Whether the server agrees.** The page is requested as a browser and as every
crawler with a confirmed, officially published User-Agent string — 22 of the
29 agents; the rest have no real header to send as, so they're evaluated
against `robots.txt` only. When a browser gets 200 and a crawler gets 403,
that is a CDN or firewall rule contradicting `robots.txt` — often news to the
site's owner.

**What a crawler reads.** Text extracted from the raw HTML with scripts and
markup stripped: word count, approximate tokens, text-to-HTML ratio, and an
excerpt. Pages assembled in the browser are flagged, because most AI crawlers
do not run JavaScript and see almost nothing.

**What a crawler that renders JavaScript sees.** An on-demand second pass —
the same idea as Googlebot's two-pass indexing — that actually launches a
headless browser, runs the page's scripts, and extracts the same stats
(word count, tokens, text ratio, headings, structured data) from the
resulting DOM. Sits side by side with the raw-fetch numbers above it, so the
gap between "what a plain fetch gets" and "what a JS-executing crawler gets"
is a number, not a guess. Not run automatically — it costs real CPU/RAM
(a real Chromium process) — there's a button once a check has results.

**The directives that aren't in robots.txt.** The robots meta tag,
`X-Robots-Tag`, `noai` / `noimageai`, and whether `llms.txt` is published.

`robots.txt` handling follows RFC 9309 rather than approximating it: longest
matching pattern wins, `Allow` breaks ties, `*` and `$` patterns, group
selection by exact token falling back to `*`, empty `Disallow` as allow-all,
and an unreachable file treated as a full disallow.

## Run it yourself — that's the point

**Whoever runs this appears in the target site's access logs as the thing that
made the request.**

That is the reason this is code you run rather than a service someone hosts. A
public instance fetches whatever URL a stranger types, which puts its operator's
domain in the logs of every site anyone chooses to point it at — including sites
they would not want to be associated with. No amount of rate limiting fixes
that; the only fix is for the request to come from the person who wanted it.

If you deploy this somewhere public, that exposure becomes yours.

## Security

Fetching URLs supplied by a user is textbook SSRF, so:

- Address validation runs inside the DNS `lookup` hook, at connect time.
  Resolving first and then handing over a hostname leaves a rebinding window.
- Every redirect hop is revalidated. A permitted host redirecting to
  `169.254.169.254` is the classic way in.
- Private, loopback, link-local, CGNAT, multicast and reserved ranges are
  blocked, IPv4 and IPv6, including IPv4-mapped, NAT64 and 6to4 forms.
- http and https only, ports 80 and 443 only, 2 MB cap, 8 second timeout,
  5 redirects maximum.

**The rendered pass is a real browser, which is a wider SSRF surface than a
plain fetch** — it resolves and connects to hosts on its own, outside Node's
`lookup` hook above. It's closed the same way: every request the page makes
(the navigation, every redirect, every subresource — images, XHR, fonts,
whatever the page's own JS fetches) is intercepted, its hostname resolved
and checked against the same blocked-range list, and only let through if it
clears. That's a real request-by-request check, not a one-time check of the
URL you typed, so it also catches SSRF attempts hiding behind a page's own
client-side requests. It does not fully close DNS-rebinding between that
check and Chromium's own connect — no browser hook pins a resolved IP for
an arbitrary, runtime-discovered set of hostnames — but the window is the
same shape as the one the raw-fetch path above already accepts, not a wider
one. It also gets a tighter rate limit (4/minute vs. 10/minute) since it
costs a real Chromium process rather than a handful of HTTP requests.

**The rate limit is deliberately weak.** It is an in-memory counter, which on
any multi-instance host is per-instance rather than per-user. It slows casual
hammering and nothing more. Running locally, that is fine. Hosting it publicly
means replacing it with something backed by shared state — and reading the
section above first.

Each check makes 25 outbound requests to the target: `robots.txt`, `llms.txt`,
and the page as a browser plus 22 real crawler user agents. That's only
practical because this isn't a shared, hosted instance — see "Run it
yourself" above. Hosting this publicly with that request count would be
inconsiderate to every site a stranger points it at.

## Maintenance

AI companies add and retire crawler user-agents constantly. The agent registry
in `lib/crawler-view/agents.ts` is the part that goes stale — worth a look
every few months against the operators' published crawler documentation.

Five agents (Bytespider, cohere-ai, Diffbot, YouBot, Timpibot) don't have a
`ua`, because no confirmed official User-Agent string could be found for them
at the time they were added — see each entry's `note`. If an operator
publishes one, add it and the agent joins the live fetch automatically.

## License

MIT.
