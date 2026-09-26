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
  const title = "Echo Shift — The world listens";
  const description = "Pilot a hovercraft through floating ocean ruins in a playable 3D browser game. Collect crystals, dodge storms, and tell the AI director how to change your world.";
  const image = new URL("/og.png", base).toString();
  return {
    metadataBase: base, title, description,
    icons: { icon: "/favicon.png" },
    openGraph: {
      type: "website", title, description, siteName: "Echo Shift", url: base.toString(),
      images: [{ url: image, alt: "ECHO SHIFT — The world listens. A hovercraft crosses luminous ocean ruins." }],
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
