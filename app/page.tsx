import { CrawlerView } from "@/components/crawler-view";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Botsight
        </h1>
        <p className="text-muted">
          Every AI company runs its crawlers under separate names, and a
          robots.txt written before they existed treats them all the same. This
          shows which ones a site&apos;s rules actually admit — and whether its
          server agrees with what those rules say.
        </p>
      </header>
      <CrawlerView />
    </main>
  );
}
