import {
  agents,
  browserUa,
  fetchableAgents,
  type Agent,
} from "./agents";
import { extract, type Extraction } from "./extract";
import { fetchAs, validateUrl } from "./fetch";
import {
  evaluate,
  parseRobots,
  type Rule,
  type RobotsStatus,
} from "./robots";

export type AgentVerdict = {
  token: string;
  label: string;
  operator: string;
  purpose: Agent["purpose"];
  note?: string;
  allowed: boolean;
  rule?: Rule;
  matchedBy: "agent" | "wildcard" | "none";
};

export type FetchRow = {
  label: string;
  status: number | null;
  bytes: number | null;
  elapsedMs: number | null;
  error?: string;
  server?: string;
  /** Served an auth/rate-limit refusal while a browser was let through. */
  blocked: boolean;
};

export type Analysis = {
  url: string;
  robotsUrl: string;
  robotsState: "ok" | "absent" | "unreachable";
  robotsDetail: string;
  robotsText: string | null;
  sitemaps: string[];
  verdicts: AgentVerdict[];
  fetches: FetchRow[];
  /** Absent when the page itself could not be fetched. */
  extraction: Extraction | null;
  llmsTxt: boolean;
};

const ROBOTS_DISPLAY_LIMIT = 8000;

async function loadRobots(
  origin: string,
): Promise<{ status: RobotsStatus; raw: string | null; detail: string }> {
  const outcome = await fetchAs(`${origin}/robots.txt`, browserUa);

  if (!outcome.ok) {
    return {
      status: { kind: "unreachable", detail: outcome.error },
      raw: null,
      detail: outcome.error,
    };
  }

  const { status, body } = outcome.result;

  if (status >= 500) {
    return {
      status: { kind: "unreachable", detail: `robots.txt returned ${status}` },
      raw: null,
      detail: `Returned ${status}. Under RFC 9309 a server error means crawlers should treat the whole site as disallowed.`,
    };
  }

  if (status >= 400) {
    return {
      status: { kind: "absent", status },
      raw: null,
      detail: `Returned ${status}. No robots.txt means nothing is restricted.`,
    };
  }

  return {
    status: { kind: "ok", robots: parseRobots(body) },
    raw: body.slice(0, ROBOTS_DISPLAY_LIMIT),
    detail: `Returned ${status}.`,
  };
}

async function hasLlmsTxt(origin: string): Promise<boolean> {
  const outcome = await fetchAs(`${origin}/llms.txt`, browserUa);
  return outcome.ok && outcome.result.status >= 200 && outcome.result.status < 300;
}

export async function analyze(input: string): Promise<Analysis> {
  const url = validateUrl(input);
  const path = url.pathname + url.search;

  const [{ status, raw, detail }, llmsTxt] = await Promise.all([
    loadRobots(url.origin),
    hasLlmsTxt(url.origin),
  ]);

  const verdicts: AgentVerdict[] = agents.map((agent) => {
    const verdict = evaluate(status, agent.token, path);
    return {
      token: agent.token,
      label: agent.label,
      operator: agent.operator,
      purpose: agent.purpose,
      note: agent.note,
      allowed: verdict.allowed,
      rule: verdict.rule,
      matchedBy: verdict.matchedBy,
    };
  });

  // A small, deliberate set. Sending twenty requests to someone else's server to
  // answer one question would make this tool the thing it warns you about.
  const targets: Array<{ label: string; ua: string }> = [
    { label: "A browser", ua: browserUa },
    ...fetchableAgents.map((a) => ({ label: a.label, ua: a.ua! })),
  ];

  const settled = await Promise.all(
    targets.map(async ({ label, ua }) => {
      const outcome = await fetchAs(url, ua);
      if (!outcome.ok) {
        return {
          row: {
            label,
            status: null,
            bytes: null,
            elapsedMs: null,
            error: outcome.error,
            blocked: false,
          } satisfies FetchRow,
          body: null,
          headers: {} as Record<string, string>,
        };
      }
      const { result } = outcome;
      return {
        row: {
          label,
          status: result.status,
          bytes: Buffer.byteLength(result.body, "utf8"),
          elapsedMs: result.elapsedMs,
          server: result.headers.server,
          blocked: false,
        } satisfies FetchRow,
        body: result.body,
        headers: result.headers,
      };
    }),
  );

  const browser = settled[0];
  const browserOk =
    browser.row.status !== null &&
    browser.row.status >= 200 &&
    browser.row.status < 300;

  const fetches = settled.map(({ row }, index) => {
    if (index === 0 || !browserOk || row.status === null) return row;
    const refused = [401, 403, 405, 406, 429].includes(row.status);
    return { ...row, blocked: refused };
  });

  return {
    url: url.toString(),
    robotsUrl: `${url.origin}/robots.txt`,
    robotsState: status.kind,
    robotsDetail: detail,
    robotsText: raw,
    sitemaps: status.kind === "ok" ? status.robots.sitemaps : [],
    verdicts,
    fetches,
    extraction:
      browserOk && browser.body !== null
        ? extract(browser.body, browser.headers)
        : null,
    llmsTxt,
  };
}
