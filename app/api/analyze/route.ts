import { NextResponse } from "next/server";
import { analyze } from "@/lib/crawler-view/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Best-effort throttle. Serverless instances don't share memory, so this slows
 * down a casual hammering rather than stopping a determined one. Anything
 * stronger needs shared state.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
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
      { error: "Too many checks in the last minute. Give it a moment." },
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
    return NextResponse.json({ error: "Give me a URL to check." }, { status: 400 });
  }
  if (url.length > 2048) {
    return NextResponse.json({ error: "That URL is too long." }, { status: 400 });
  }

  try {
    return NextResponse.json(await analyze(url));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
