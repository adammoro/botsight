/**
 * What a crawler that does not run JavaScript actually reads.
 *
 * This works on raw HTML rather than a rendered DOM, which is the point: it
 * sees what a fetch sees. Where a page depends on client-side rendering, the
 * result is close to empty, and that emptiness is the finding.
 *
 * Parsing is deliberately regex-based and dependency-free. It is accurate
 * enough for text, metadata and structured data, and it stays honest about
 * what it cannot do — nothing here executes scripts or resolves the DOM.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => {
      const key = String(name).toLowerCase();
      return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : match;
    });
}

/** Elements whose contents are never read as page text. */
const DROPPED = /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(DROPPED, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metaContent(html: string, matcher: RegExp): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!matcher.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (content) return decodeEntities(content[1]).trim();
  }
  return null;
}

function collectTypes(node: unknown, into: Set<string>) {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, into);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") into.add(type);
  if (Array.isArray(type)) for (const t of type) if (typeof t === "string") into.add(t);
  for (const value of Object.values(record)) collectTypes(value, into);
}

export type Directives = {
  robotsMeta: string | null;
  xRobotsTag: string | null;
  noai: boolean;
  noimageai: boolean;
};

export type Extraction = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  headings: Array<{ level: number; text: string }>;
  wordCount: number;
  approxTokens: number;
  /** Extracted text as a share of the raw HTML. Low means markup-heavy. */
  textRatio: number;
  excerpt: string;
  structuredData: string[];
  clientRendered: { likely: boolean; reasons: string[] };
  directives: Directives;
};

const EXCERPT_LIMIT = 600;

export function extract(html: string, headers: Record<string, string>): Extraction {
  const text = visibleText(html);
  const words = text ? text.split(/\s+/).filter(Boolean) : [];

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalMatch = html.match(
    /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i,
  );

  const headings: Array<{ level: number; text: string }> = [];
  for (const match of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const inner = visibleText(match[2]);
    if (inner) headings.push({ level: Number(match[1]), text: inner });
  }

  const types = new Set<string>();
  for (const block of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collectTypes(JSON.parse(block[1].trim()), types);
    } catch {
      types.add("(unparseable JSON-LD)");
    }
  }

  // Signals that the page is assembled in the browser. None is conclusive on
  // its own, which is why they are reported as reasons rather than a verdict.
  const reasons: string[] = [];
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  if (words.length < 100 && html.length > 15_000) {
    reasons.push(`only ${words.length} words in ${(html.length / 1024).toFixed(0)} KB of HTML`);
  }
  if (/<div\s+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html)) {
    reasons.push("an empty mount element is present");
  }
  if (/__NEXT_DATA__|window\.__NUXT__|data-reactroot|ng-version/i.test(html)) {
    reasons.push("client framework markers are present");
  }
  if (scriptCount > 25) {
    reasons.push(`${scriptCount} script tags`);
  }

  return {
    title: titleMatch ? decodeEntities(visibleText(titleMatch[1])) : null,
    metaDescription: metaContent(html, /name\s*=\s*["']description["']/i),
    canonical: canonicalMatch
      ? (canonicalMatch[0].match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? null)
      : null,
    headings: headings.slice(0, 25),
    wordCount: words.length,
    approxTokens: Math.round(text.length / 4),
    textRatio: html.length ? text.length / html.length : 0,
    excerpt:
      text.length > EXCERPT_LIMIT ? `${text.slice(0, EXCERPT_LIMIT)}…` : text,
    structuredData: [...types],
    clientRendered: { likely: reasons.length >= 2, reasons },
    directives: {
      robotsMeta: metaContent(html, /name\s*=\s*["']robots["']/i),
      xRobotsTag: headers["x-robots-tag"] ?? null,
      noai: /name\s*=\s*["']noai["']/i.test(html),
      noimageai: /name\s*=\s*["']noimageai["']/i.test(html),
    },
  };
}
