import { NextResponse } from "next/server";
import { renderPage } from "@/lib/crawler-view/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same best-effort, per-instance throttle as /api/analyze, but tighter:
 * each call launches a real Chromium process, which costs real CPU/RAM on
 * whatever's running this (a Raspberry Pi, in the common case) — a handful
 * of raw fetches costs nothing comparable.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many renders in the last minute. Give it a moment." },
      { status: 429 },
    );
  }

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "Give me a URL to render." }, { status: 400 });
  }
  if (url.length > 2048) {
    return NextResponse.json({ error: "That URL is too long." }, { status: 400 });
  }

  const outcome = await renderPage(url);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }
  return NextResponse.json(outcome);
}
