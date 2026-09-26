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
  const title = "The Last Oracle — An Aegean Survival Story";
  const description = "One minute to gather. Five days to endure. Explore an ancient Greek island in 3D, rescue companions, speak with your hero, and keep the beacon alive.";
  const image = new URL("/oracle/cover.jpg", base).toString();
  return {
    metadataBase: base, title, description,
    icons: { icon: "/oracle/lyra.jpg" },
    openGraph: {
      type: "website", title, description, siteName: "The Last Oracle", url: base.toString(),
      images: [{ url: image, alt: "The Last Oracle — Lyra looks over an ancient Mediterranean island as a distant volcano awakens." }],
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
