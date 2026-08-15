# Botsight

Point it at a URL and see which AI crawlers the site's `robots.txt` admits,
whether the server actually agrees, and what a crawler that doesn't run
JavaScript really reads.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## What it reports

**Who robots.txt admits.** 29 agents evaluated and grouped by what they are
for — training, search and answer, user-triggered fetch, and the control-only
tokens that never crawl at all. That includes the traditional search engine
crawlers (Bingbot, YandexBot, Baiduspider, DuckDuckBot) alongside the AI ones,
since search visibility is as much the point here as AI visibility. Each row
shows the verdict, the rule that decided it, and whether the agent was named
explicitly or fell through to `User-agent: *`, which is usually where the
surprises are.

**Whether the server agrees.** The page is requested as a browser and as
several real crawler user agents. When a browser gets 200 and a crawler gets
403, that is a CDN or firewall rule contradicting `robots.txt` — often news to
the site's owner.

**What a crawler reads.** Text extracted from the raw HTML with scripts and
markup stripped: word count, approximate tokens, text-to-HTML ratio, and an
excerpt. Pages assembled in the browser are flagged, because most AI crawlers
do not run JavaScript and see almost nothing.

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

**The rate limit is deliberately weak.** It is an in-memory counter, which on
any multi-instance host is per-instance rather than per-user. It slows casual
hammering and nothing more. Running locally, that is fine. Hosting it publicly
means replacing it with something backed by shared state — and reading the
section above first.

Each check makes seven outbound requests to the target: `robots.txt`,
`llms.txt`, and the page as six different agents.

## Maintenance

AI companies add and retire crawler user-agents constantly. The agent registry
in `lib/crawler-view/agents.ts` is the part that goes stale — worth a look
every few months against the operators' published crawler documentation.

## License

MIT.
