import { z } from "zod";

/**
 * How a team logo is fitted into the site's logo boxes (db/migrations/107_logo_fit.sql, seed db/seed/logo_fit.csv).
 * A logo with no row is drawn as it always was. Only rows with status "approved" reach the public pages;
 * /admin/logos draws the proposed ones too, so they can be looked at before anyone approves them.
 */

export const logoFitSchema = z.object({
  logo_file: z.string(),
  league: z.string().nullable(),
  team: z.string(),
  wordmark: z.boolean(),
  mark_url: z.string().nullable(),
  mark_licence: z.string().nullable(),
  mark_page: z.string().nullable(),
  scale: z.number(),
  dx: z.number(),
  dy: z.number(),
  bg: z.string(),
  status: z.enum(["proposed", "approved", "rejected"]),
  note: z.string().nullable(),
});
export type LogoFit = z.infer<typeof logoFitSchema>;

/** The fit a logo with no row gets: today's drawing. */
export const NO_FIT = { wordmark: false, mark_url: null, scale: 1, dx: 0, dy: 0, bg: "auto" } as const;

/**
 * The key of a logo URL: the wiki and the file name inside it, e.g. "commons:BluesWordmark.gif" (or "sl:5044.gif" for one of our own SportsLogos.Net files). The same as `core.logo_file(url)` in the
 * database; the file name stays as the URL spells it (percent-encoded), so neither side decodes it.
 */
export function logoKey(url: string | null | undefined): string | null {
  const m = url ? /\/wikipedia\/([^/]+)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(url) : null;
  if (m) return `${m[1]}:${m[2]}`;
  // a SportsLogos.Net file the site serves itself (/team-logos/sl/5044.gif) is "sl:5044.gif"
  const sl = url ? /^\/team-logos\/sl\/([^/?]+)$/.exec(url) : null;
  return sl ? `sl:${sl[1]}` : null;
}

/** What a page needs to draw a fit: a short tuple per logo, so that the table sent with every page stays small. [mark, scale, dx, dy, bg, wordmark] */
export type FitTuple = [mark: string, scale: number, dx: number, dy: number, bg: string, wordmark: 0 | 1];
export type FitTable = Record<string, FitTuple>;

/** True when a row changes nothing about how its logo is drawn. */
export function isDefaultFit(f: Pick<LogoFit, "wordmark" | "mark_url" | "scale" | "dx" | "dy" | "bg">): boolean {
  return !f.wordmark && !f.mark_url && f.scale === 1 && f.dx === 0 && f.dy === 0 && f.bg === "auto";
}

/** The table of the approved fits that change something: the only part of logo_fit the public pages carry. */
export function approvedTable(rows: LogoFit[]): FitTable {
  const table: FitTable = {};
  for (const r of rows) {
    if (r.status !== "approved" || isDefaultFit(r)) continue;
    table[r.logo_file] = [r.mark_url ?? "", r.scale, r.dx, r.dy, r.bg, r.wordmark ? 1 : 0];
  }
  return table;
}

/** A fit as TeamLogo draws it. */
export interface Fit { mark: string | null; scale: number; dx: number; dy: number; bg: string; wordmark: boolean }

export const fitOf = (row: Pick<LogoFit, "wordmark" | "mark_url" | "scale" | "dx" | "dy" | "bg">): Fit =>
  ({ mark: row.mark_url, scale: row.scale, dx: row.dx, dy: row.dy, bg: row.bg, wordmark: row.wordmark });

export const fitFromTuple = ([mark, scale, dx, dy, bg, wordmark]: FitTuple): Fit =>
  ({ mark: mark || null, scale, dx, dy, bg, wordmark: wordmark === 1 });

/** True when the fit moves, scales or recolours the picture inside its tile (not just swaps the image). */
export const fitsTile = (f: Fit): boolean => f.scale !== 1 || f.dx !== 0 || f.dy !== 0 || f.bg !== "auto";

/** The tile colour a fit asks for, or null for the theme's own. */
export function tileColour(bg: string): string | null {
  if (bg === "light") return "#ffffff";
  if (bg === "dark") return "#14181d";
  return /^[0-9A-F]{6}$/.test(bg) ? `#${bg}` : null;
}

/** The logo boxes: the one inline size of a table cell and the larger tiles. */
export const INLINE_MAX = 28;
