# Working notes

A tool people clone and run locally: point it at a URL, see which AI
crawlers the site's robots.txt admits, whether the server agrees when
actually asked, and what a non-rendering crawler reads.

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
- **The rate limit is weak on purpose** (in-memory, per-instance) and the
  README says so. It's fine for local use, which is the intended use.
- robots.txt evaluation follows RFC 9309: longest match wins, `Allow`
  breaks ties, `$` anchors, group fallback to `*`, unreachable file =
  full disallow. The tests encode all of this.

## Goes stale

`lib/crawler-view/agents.ts` — AI companies add and retire crawler tokens
constantly. Check operators' published crawler docs quarterly. The
adammoro.com robots.txt is maintained in tandem with this list.
