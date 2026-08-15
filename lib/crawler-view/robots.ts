/**
 * A robots.txt parser and evaluator following RFC 9309.
 *
 * The rules that trip people up, and which this implements:
 *   - Longest matching pattern wins, and Allow beats Disallow on a tie.
 *   - `*` matches any sequence, `$` anchors the end of the path.
 *   - An empty Disallow value permits everything.
 *   - Group selection is by exact (case-insensitive) token, falling back to `*`.
 */

export type Rule = { type: "allow" | "disallow"; pattern: string };
export type Group = { agents: string[]; rules: Rule[] };

export type Robots = {
  groups: Group[];
  sitemaps: string[];
};

/** How the robots.txt itself was obtained — this changes what the rules mean. */
export type RobotsStatus =
  | { kind: "ok"; robots: Robots }
  /** Missing or client error: everything is permitted. */
  | { kind: "absent"; status: number }
  /** Server error or unreachable: RFC 9309 says treat as fully disallowed. */
  | { kind: "unreachable"; detail: string };

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];

  let current: Group | null = null;
  // Tracks whether the previous meaningful line was a rule, which is what makes
  // the next User-agent line start a new group rather than extend this one.
  let sawRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (!current) continue;
      sawRule = true;
      // "Disallow:" with no value is an explicit allow-everything, not a rule.
      if (field === "disallow" && value === "") continue;
      if (value) current.rules.push({ type: field, pattern: value });
    }
  }

  return { groups, sitemaps };
}

function patternToRegex(pattern: string): RegExp {
  let anchored = false;
  let body = pattern;
  if (body.endsWith("$")) {
    anchored = true;
    body = body.slice(0, -1);
  }
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp("^" + escaped + (anchored ? "$" : ""));
}

/** The group that applies to a token, or null when none does. */
export function groupFor(robots: Robots, token: string): Group | null {
  const wanted = token.toLowerCase();
  const exact = robots.groups.find((g) => g.agents.includes(wanted));
  if (exact) return exact;
  return robots.groups.find((g) => g.agents.includes("*")) ?? null;
}

export type Verdict = {
  allowed: boolean;
  /** The rule that decided it, absent when nothing matched. */
  rule?: Rule;
  /** Which group was consulted: the agent's own, the wildcard, or none. */
  matchedBy: "agent" | "wildcard" | "none";
};

export function evaluate(
  status: RobotsStatus,
  token: string,
  path: string,
): Verdict {
  if (status.kind === "absent") return { allowed: true, matchedBy: "none" };
  if (status.kind === "unreachable") return { allowed: false, matchedBy: "none" };

  const { robots } = status;
  const wanted = token.toLowerCase();
  const exact = robots.groups.find((g) => g.agents.includes(wanted));
  const group = exact ?? robots.groups.find((g) => g.agents.includes("*"));
  if (!group) return { allowed: true, matchedBy: "none" };

  const matchedBy = exact ? "agent" : "wildcard";

  let best: Rule | undefined;
  let bestLength = -1;
  for (const rule of group.rules) {
    if (!patternToRegex(rule.pattern).test(path)) continue;
    const length = rule.pattern.length;
    // Longest wins; on a tie Allow takes precedence.
    if (
      length > bestLength ||
      (length === bestLength && rule.type === "allow" && best?.type === "disallow")
    ) {
      best = rule;
      bestLength = length;
    }
  }

  if (!best) return { allowed: true, matchedBy };
  return { allowed: best.type === "allow", rule: best, matchedBy };
}
