import type { Metadata } from "next";

/**
 * The head of every page: the shield as favicon, apple-touch and app icons, the web app manifest, and the social preview picture (the spxn.com
 * lockup). They are SPXIS marks, © SportsInteractive, and live in public/brand (scripts/brand draws them from John's originals).
 * A page that sets its own `openGraph` or `twitter` replaces the layout's, so lib/meta.ts and the home page add `SOCIAL_IMAGES` themselves.
 */
const OG = { url: "/brand/og.png", width: 1200, height: 630, alt: "spxn.com, a sportsinteractive network" };

export const SOCIAL_IMAGES = { openGraph: [OG], twitter: [OG.url] } as const;

export const SITE_ICONS: Metadata["icons"] = {
  icon: [
    { url: "/brand/shield-icon.svg", type: "image/svg+xml" },
    { url: "/favicon.ico", sizes: "48x48" },
  ],
  apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
};
