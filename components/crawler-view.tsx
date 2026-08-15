"use client";

import { useState } from "react";
import {
  purposeLabels,
  purposeNotes,
  type Purpose,
} from "@/lib/crawler-view/agents";
import type { Analysis, AgentVerdict } from "@/lib/crawler-view/analyze";

const purposeOrder: Purpose[] = ["training", "search", "user", "control"];

function AgentRow({ verdict }: { verdict: AgentVerdict }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="py-3 pr-4">
        <div className="font-medium">{verdict.label}</div>
        <div className="text-sm text-muted">{verdict.operator}</div>
        {verdict.note && (
          <p className="mt-1 max-w-prose text-sm text-muted">{verdict.note}</p>
        )}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <span
          className={
            verdict.allowed
              ? "font-medium text-success"
              : "font-medium text-danger"
          }
        >
          {verdict.allowed ? "Allowed" : "Blocked"}
        </span>
      </td>
      <td className="py-3 text-sm text-muted">
        {verdict.rule ? (
          <code className="rounded border border-border bg-surface px-1.5 py-0.5">
            {verdict.rule.type === "allow" ? "Allow" : "Disallow"}:{" "}
            {verdict.rule.pattern}
          </code>
        ) : (
          <span>no matching rule</span>
        )}
        <div className="mt-1">
          {verdict.matchedBy === "agent" && "named explicitly"}
          {verdict.matchedBy === "wildcard" && "falls under User-agent: *"}
          {verdict.matchedBy === "none" && "—"}
        </div>
      </td>
    </tr>
  );
}

export function CrawlerView() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analysis | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Something went wrong.");
      else setData(json as Analysis);
    } catch {
      setError("Could not reach the checker.");
    } finally {
      setBusy(false);
    }
  }

  const blockedFetches = data?.fetches.filter((f) => f.blocked) ?? [];

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="url" className="text-sm font-medium">
          Page URL
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="url"
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/some-page"
            className="w-full rounded border border-border bg-surface px-3 py-2 outline-none placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="shrink-0 rounded border border-accent px-4 py-2 font-medium text-accent transition-colors hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-accent"
          >
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
        <p className="text-sm text-muted">
          Fetches the page and its robots.txt a handful of times. Nothing is
          stored.
        </p>
      </form>

      {error && (
        <p className="rounded border border-danger px-4 py-3 text-danger">
          {error}
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
              robots.txt
            </h2>
            <p>
              {data.robotsState === "ok" && "Found and parsed."}
              {data.robotsState === "absent" && "Not published."}
              {data.robotsState === "unreachable" && "Could not be read."}{" "}
              <span className="text-muted">{data.robotsDetail}</span>
            </p>
            {data.robotsState === "unreachable" && (
              <p className="text-muted">
                This is the case people miss. A crawler that cannot read your
                robots.txt is supposed to assume the whole site is off limits,
                so an outage here reads as a blanket refusal.
              </p>
            )}
            {data.sitemaps.length > 0 && (
              <p className="text-sm text-muted">
                Sitemaps declared: {data.sitemaps.length}
              </p>
            )}
          </section>

          {blockedFetches.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
                Server disagrees with robots.txt
              </h2>
              <p>
                A browser was served the page, but{" "}
                {blockedFetches.map((f) => f.label).join(", ")} got turned away
                at the door. That refusal usually comes from a CDN or firewall
                rule rather than anything in robots.txt — which means the site
                may be blocking crawlers its owner believes are welcome.
              </p>
            </section>
          )}

          {data.extraction?.clientRendered.likely && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
                Likely assembled in the browser
              </h2>
              <p>
                Most crawlers don&apos;t run JavaScript, so they may see very
                little of this page — whatever arrives before the scripts do.
                Signals here: {data.extraction.clientRendered.reasons.join("; ")}.
              </p>
              <p className="text-sm text-muted">
                This is a reading of the raw HTML, not a rendered page. It says
                what a plain fetch receives, which is what most crawlers get.
              </p>
            </section>
          )}

          {data.extraction && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
                What a crawler reads
              </h2>
              <p className="text-muted">
                {data.extraction.wordCount.toLocaleString()} words, roughly{" "}
                {data.extraction.approxTokens.toLocaleString()} tokens.{" "}
                {(data.extraction.textRatio * 100).toFixed(1)}% of the HTML is
                text.
              </p>

              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted">Title</dt>
                  <dd>{data.extraction.title ?? "— none —"}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted">Meta description</dt>
                  <dd>{data.extraction.metaDescription ?? "— none —"}</dd>
                </div>
                {data.extraction.structuredData.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted">Structured data</dt>
                    <dd>{data.extraction.structuredData.join(", ")}</dd>
                  </div>
                )}
              </dl>

              {data.extraction.excerpt && (
                <blockquote className="border-l-2 border-border pl-4 text-muted">
                  {data.extraction.excerpt}
                </blockquote>
              )}
            </section>
          )}

          {data.extraction && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
                Directives outside robots.txt
              </h2>
              <p className="text-sm text-muted">
                Rules that live in the page or its headers. A robots.txt checker
                won&apos;t report these, and they override nothing in it — they
                answer a different question.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  <span className="text-muted">Robots meta tag: </span>
                  {data.extraction.directives.robotsMeta ?? "not set"}
                </li>
                <li>
                  <span className="text-muted">X-Robots-Tag header: </span>
                  {data.extraction.directives.xRobotsTag ?? "not set"}
                </li>
                <li>
                  <span className="text-muted">noai / noimageai: </span>
                  {data.extraction.directives.noai ||
                  data.extraction.directives.noimageai
                    ? [
                        data.extraction.directives.noai && "noai",
                        data.extraction.directives.noimageai && "noimageai",
                      ]
                        .filter(Boolean)
                        .join(", ")
                    : "not set"}
                </li>
                <li>
                  <span className="text-muted">llms.txt: </span>
                  {data.llmsTxt ? "published" : "not published"}
                </li>
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
              What the server returned
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-left">
                <thead>
                  <tr className="text-sm text-muted">
                    <th className="pb-2 pr-4 font-medium">Requested as</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Size</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fetches.map((row) => (
                    <tr key={row.label} className="border-t border-border">
                      <td className="py-2 pr-4">{row.label}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {row.error ? (
                          <span className="text-danger">failed</span>
                        ) : (
                          <span className={row.blocked ? "font-medium text-danger" : ""}>
                            {row.status}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted">
                        {row.bytes === null
                          ? "—"
                          : `${(row.bytes / 1024).toFixed(1)} KB`}
                      </td>
                      <td className="py-2 whitespace-nowrap text-muted">
                        {row.elapsedMs === null ? "—" : `${row.elapsedMs} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {purposeOrder.map((purpose) => {
            const rows = data.verdicts.filter((v) => v.purpose === purpose);
            if (rows.length === 0) return null;
            return (
              <section key={purpose} className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
                    {purposeLabels[purpose]}
                  </h2>
                  <p className="text-sm text-muted">{purposeNotes[purpose]}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] border-collapse text-left">
                    <tbody>
                      {rows.map((verdict) => (
                        <AgentRow key={verdict.token} verdict={verdict} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {data.robotsText && (
            <details className="rounded border border-border p-4">
              <summary className="cursor-pointer font-medium">
                Raw robots.txt
              </summary>
              <pre className="mt-3 overflow-x-auto text-sm">
                {data.robotsText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
