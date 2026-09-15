# Working notes

A tool people clone and run locally: point it at a URL, see which AI and
search engine crawlers the site's robots.txt admits, whether the server
agrees when actually asked, and what a non-rendering crawler reads.

## Commands

- `npm run dev` / `npm run build` / `npm start`
- `npm test` — 79 plain assertions, no framework. Uses Node's TS
  type-stripping, hence `engines: >=22.6`.
- `npm run lint`

Run all three before committing. The tests are the spec for the robots.txt
evaluator and the SSRF guards; a change that fails them is wrong until
proven otherwise.

## Invariants

- **This is deliberately not a hosted service.** Whoever runs it appears in
  the target's access logs as the requester. A public instance would put its
  operator's domain in the logs of any site a stranger points it at. Don't
  add deployment configs or "deploy" buttons; the README explains this to
  users.
- **`lib/crawler-view/fetch.ts` is security-critical.** Address validation
  runs in the DNS lookup hook at connect time; every redirect hop is
  revalidated; private/loopback/link-local ranges are blocked in both IPv4
  and IPv6 including IPv4-mapped, NAT64 and 6to4 forms. Never loosen these
  without adding the failing test first. History note: `http://[::1]/` once
  passed validation because `new URL()` keeps brackets and
  `net.isIP("[::1]")` is 0 — that class of bug is why the test suite is
  paranoid.
- **`lib/crawler-view/render.ts` is also security-critical**, same reason,
  different mechanism. It drives a real headless Chromium (`puppeteer-core`
  against a system binary, not a bundled download), which resolves and
  connects on its own — Node's `lookup` hook has no reach into it. The guard
  is request interception: every request the page makes (navigation,
  redirects, subresources) is checked against `isBlockedIp()` from
  `fetch.ts` before being allowed through. Reuses the same blocklist on
  purpose — one list of forbidden ranges, not two to keep in sync.
- **The rate limit is weak on purpose** (in-memory, per-instance) and the
  README says so. It's fine for local use, which is the intended use.
- robots.txt evaluation follows RFC 9309: longest match wins, `Allow`
  breaks ties, `$` anchors, group fallback to `*`, unreachable file =
  full disallow. The tests encode all of this.

## Goes stale

`lib/crawler-view/agents.ts` — AI companies add and retire crawler tokens
constantly. Check operators' published crawler docs quarterly. Most agents
now carry a `ua` and get a real live request (`fetchableAgents` in
`agents.ts`); the exceptions (currently Bytespider, cohere-ai, Diffbot,
YouBot, Timpibot) have no confirmed official User-Agent string — don't invent
one, a fabricated header misrepresents what the real crawler sees. Add `ua`
only once you've verified it against the operator's own docs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
