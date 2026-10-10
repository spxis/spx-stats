import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { currentLocale, currentSpeaker } from "@/lib/i18n/currentLocale";
import { SITE_URL } from "@/lib/leagues";
import { LOCALE_OG } from "@/lib/locale";
import "./globals.css";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow", display: "swap" });
const source = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { say, locale } = await currentSpeaker();
  const description = say("site.description");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: "SPXN · SPX Stats Network", template: "%s · SPXN" },
    description,
    openGraph: { siteName: "SPXN", type: "website", locale: LOCALE_OG[locale], title: "SPXN · SPX Stats Network", description },
    twitter: { card: "summary", title: "SPXN · SPX Stats Network", description },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Runs before first paint so a saved light or dark choice never flashes the other one.
const themeScript = `try { const t = localStorage.getItem('spxn-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale();
  return (
    <html lang={locale} className={`${barlow.variable} ${source.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          <SiteHeader />
          <main id="app" tabIndex={-1} className="page">
            {children}
          </main>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
