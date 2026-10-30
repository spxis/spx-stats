import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import type { ReactNode } from "react";
import { AccountProvider, AdminBar, type Account } from "@/components/auth/Account";
import { LeagueCrumbs } from "@/components/LeagueCrumbs";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { authEnabled } from "@/lib/auth/config";
import { SITE_ICONS, SOCIAL_IMAGES } from "@/lib/brandAssets";
import { HINT_SCRIPT } from "@/lib/auth/hint";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { SITE_URL } from "@/lib/leagues";
import { LOCALE_OG, type Locale } from "@/lib/locale";
import { RANGE_HOLD_SCRIPT } from "@/lib/yearRange";
import "@/app/globals.css";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow", display: "swap" });
const source = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

/** The title and description every page inherits, in the language of the request. */
export async function siteMetadata(): Promise<Metadata> {
  const { say, locale } = await currentSpeaker();
  const description = say("site.description");
  return {
    metadataBase: new URL(SITE_URL),
    icons: SITE_ICONS,
    manifest: "/manifest.webmanifest",
    title: { default: "SPXN · SPX Network", template: "%s · SPXN" },
    description,
    openGraph: { siteName: "SPXN", type: "website", locale: LOCALE_OG[locale], title: "SPXN · SPX Network", description, images: [...SOCIAL_IMAGES.openGraph] },
    twitter: { card: "summary_large_image", title: "SPXN · SPX Network", description, images: [...SOCIAL_IMAGES.twitter] },
  };
}

export const siteViewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Runs before first paint so a saved light or dark choice never flashes the other one.
const themeScript = `try { const t = localStorage.getItem('spxn-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}`;

/**
 * The document around every page: head scripts, the language provider, the header, the footer. The team addresses and logo fits are not here: each page carries its own (components/TeamData.tsx). The public pages
 * (app/[locale]) are kept, so this reads nothing from the request; who is signed in is learned in the browser (AccountProvider).
 * The signed-in pages (app/(dyn)) pass `account`, which they know.
 */
export function SiteShell({ locale, account, children }: { locale: Locale; account?: Account; children: ReactNode }) {
  return (
    <html lang={locale} className={`${barlow.variable} ${source.variable} ${mono.variable}`} suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-head-element -- this is the root layout's own <head> */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: HINT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: RANGE_HOLD_SCRIPT }} />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          <AccountProvider enabled={authEnabled()} initial={account}>
            <AdminBar />
            <SiteHeader />
            <main id="app" tabIndex={-1} className="page">
              <LeagueCrumbs />
              {children}
            </main>
            <SiteFooter />
          </AccountProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
