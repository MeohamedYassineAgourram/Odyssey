import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = (incoming.get("x-forwarded-host") || incoming.get("host") || "localhost:3000").split(",")[0].trim();
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const base = new URL(`${protocol}://${host}`);
  const title = "Troy 120 — Two Minutes to Legend";
  const description = "Explore four vast cities, build defenses, and survive two-minute sieges. Face escalating enemy waves, complete changing contracts, earn XP, and rise from Recruit to Immortal.";
  const image = new URL("/troy/cover.jpg", base).toString();
  return {
    metadataBase: base, title, description,
    icons: { icon: "/oracle/lyra.jpg" },
    openGraph: {
      type: "website", title, description, siteName: "Troy 120", url: base.toString(),
      images: [{ url: image, alt: "Troy 120 — Lyra builds a coastal Greek city while a mysterious wooden horse waits beyond the gates." }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
