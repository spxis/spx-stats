import { logoKey } from "./logoFit.ts";

/**
 * The site's own small copies of team logos (docs/logos-serving.md, ticket cmv99sy290000l606fpdcpjf4).
 *
 * `scripts/logos/render_site.py` writes, at build time, WebP files at three box sizes (24, 48 and 96 px) and a manifest into the git-ignored
 * `public/team-logos/`; `next.config.ts` reads that manifest into `SPX_LOGO_FILES`. A logo the manifest lists is drawn from `/team-logos/<hash>-<tag>-<size>.webp`
 * (a few KB, immutable cache, no third party); a logo it does not list (no manifest, a new logo, a file that failed to render) is drawn from its
 * own address as before. Nothing here reads the database.
 *
 * File names are content-tagged: <hash> is a fixed hash of the logo's key (logoKey, the same for a 120 px thumbnail, a 250 px thumbnail and the
 * original of one file) and <tag> changes whenever the source bytes or the render change, so the files can be cached forever.
 */

/** The box edges, in px, a rendered file is made for. Keep in step with TIERS in scripts/logos/render_site.py. */
export const LOGO_TIERS = [24, 48, 96] as const;

/** How much wider than tall a rendered logo may be; the logo boxes allow 2.4 (teamlogo.css). Keep in step with WIDE in render_site.py. */
export const WIDE = 2.4;

/** A tiny sprite-free manifest: hash -> [tag, extension, largest tier rendered (0 for an SVG, which has one file)]. */
export type LogoManifest = { v: 1; files: Record<string, [tag: string, ext: "webp" | "svg", max: number]> };

/** FNV-1a (32 bit) of the key's UTF-8 bytes as 8 hex digits: synchronous, so the browser can name a file without a hash library. */
export function logoHash(key: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(key)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function parseManifest(text: string | undefined): LogoManifest {
  const none: LogoManifest = { v: 1, files: {} };
  if (!text) return none;
  try {
    const m = JSON.parse(text) as LogoManifest;
    return m && m.v === 1 && m.files && typeof m.files === "object" ? m : none;
  } catch {
    return none;
  }
}

/** The smallest tier whose box, drawn at 1x, is not blurrier than the slot by more than about 15 percent; the largest for the biggest slots. */
export function tierFor(size: number, max: number): number {
  const want = LOGO_TIERS.find((t) => t * 1.15 >= size) ?? LOGO_TIERS[LOGO_TIERS.length - 1];
  return Math.min(want, max);
}

const MANIFEST: LogoManifest = parseManifest(process.env.SPX_LOGO_FILES);

/** What an <img> needs for a logo drawn `size` px high, or null when the site holds no copy of it. */
export function localLogo(url: string | null | undefined, size: number, manifest: LogoManifest = MANIFEST): { src: string; srcSet?: string } | null {
  const key = logoKey(url);
  if (!key) return null;
  const hash = logoHash(key);
  const entry = manifest.files[hash];
  if (!entry) return null;
  const [tag, ext, max] = entry;
  if (ext === "svg") return { src: `/team-logos/${hash}-${tag}.svg` };
  const one = tierFor(size, max);
  const two = Math.min(LOGO_TIERS[LOGO_TIERS.indexOf(one as 24 | 48 | 96) + 1] ?? one, max);
  const file = (t: number) => `/team-logos/${hash}-${tag}-${t}.webp`;
  return two > one ? { src: file(one), srcSet: `${file(one)} 1x, ${file(two)} 2x` } : { src: file(one) };
}
