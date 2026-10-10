import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE_URL } from "@/lib/leagues";
import "./globals.css";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow", display: "swap" });
const source = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

const DESCRIPTION =
  "Scores, standings, champions and awards of the NHL, NBA, MLB, NFL and CFL, from the SPX archive and open sources.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "SPXN · SPX Stats Network", template: "%s · SPXN" },
  description: DESCRIPTION,
  openGraph: { siteName: "SPXN", type: "website", locale: "en_CA", title: "SPXN · SPX Stats Network", description: DESCRIPTION },
  twitter: { card: "summary", title: "SPXN · SPX Stats Network", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Runs before first paint so a saved light or dark choice never flashes the other one.
const themeScript = `try { const t = localStorage.getItem('spxn-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${source.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteHeader />
        <main id="app" tabIndex={-1} className="page">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
