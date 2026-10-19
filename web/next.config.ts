import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { hideInternalPaths, pageRewrites } from "./src/lib/routing.ts";

const dev = process.env.NODE_ENV !== "production";

// Same policy as the static site's vercel.json, adjusted for Next.js:
//  - Next injects small inline scripts (flight data, the theme script), so script-src needs
//    'unsafe-inline' (nonces would force every page to render per request, which we avoid).
//  - d3 and Chizu are bundled, fonts are self-hosted by next/font, and the browser never talks
//    to Supabase (the server does), so no CDN or API host is allowed any more.
//  - Logos are hot-linked from Wikimedia Commons, as before.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https://upload.wikimedia.org https://thumb.wikimedia.org https://*.googleusercontent.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// The site's own small logo copies (scripts/logos/render_site.py writes public/team-logos/ and its manifest before a deploy build; lib/logoFiles.ts).
// No manifest (a plain checkout, a remote build) means no copies and every logo is drawn from its own address, as before.
const logoManifest = (() => {
  try {
    return readFileSync(new URL("./public/team-logos/manifest.json", import.meta.url), "utf8");
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  env: { SPX_LOGO_FILES: logoManifest },
  // Lets a second build (e.g. against a stand-in API) sit beside the real one while testing.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // The public pages sit under app/[locale]/{s,q}; the address a reader sees has neither (lib/routing.ts). Rewrites run after files, so
  // /api, /sitemap.xml, /robots.txt, /_next and the signed-in pages (app/(dyn)) are never touched. src/proxy.ts applies the same
  // destinations for client navigations (Vercel minimal mode skips afterFiles inside the Next server).
  async redirects() {
    return [hideInternalPaths];
  },
  async rewrites() {
    return { beforeFiles: [], afterFiles: pageRewrites(), fallback: [] };
  },
  async headers() {
    const security = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    const noindex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    return [
      { source: "/(.*)", headers: security },
      // The pre-rendered logo copies carry their content tag in the name, so they never change under it.
      { source: "/team-logos/:file([0-9a-f]{8}-[0-9a-f]{6}(?:-[0-9]+)?\\.(?:webp|svg))", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/:league/:year/game/:game", headers: [noindex] },
      { source: "/worldcup/:year/match/:match", headers: [noindex] },
      { source: "/mls/:year/match/:match", headers: [noindex] },
      { source: "/:league/rows/:name", headers: [noindex] },
      { source: "/:league/team/:franchise/rows/:name", headers: [noindex] },
      { source: "/:league/:year/rows/:name", headers: [noindex] },
      { source: "/worldcup/:year/squad/:team/rows/:name", headers: [noindex] },
    ];
  },
};

export default nextConfig;
