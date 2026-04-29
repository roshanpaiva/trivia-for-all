import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_URL = "https://tryquizzle.com";
const SITE_NAME = "Quizzle";
const TAGLINE = "120 seconds. As many as you can get.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — 120s sprint trivia`,
    template: `%s · ${SITE_NAME}`,
  },
  description: `A 120-second sprint trivia game. Audio-first, daily leaderboard, for kids and adults at the same table. ${TAGLINE}`,
  applicationName: SITE_NAME,
  keywords: ["trivia", "quiz", "daily", "sprint", "audio", "family", "kids"],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — 120s sprint trivia`,
    description: TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — 120s sprint trivia`,
    description: TAGLINE,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        {/*
         * Cabinet Grotesk via Fontshare (DESIGN.md → Typography). Geist is loaded
         * via next/font/google above (self-hosted, no FOUT). Fontshare is the
         * official Cabinet Grotesk source — it isn't on Google Fonts.
         */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700,800&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
