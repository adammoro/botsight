import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Botsight",
  description:
    "See which AI crawlers a site's robots.txt admits, whether the server agrees, and what a non-rendering crawler actually reads.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
