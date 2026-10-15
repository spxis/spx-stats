import "server-only";
import { drawKnockoutFiles, knockoutLook, type KnockoutOptions } from "./bracketDraw";
import { speaker } from "./i18n/i18n";
import type { Locale } from "./locale";
import { loadPlayoffs } from "./playoffs";
import { roundSay } from "./roundWords";
import { seriesPath, type Series } from "./series";
import type { TeamPaths } from "./slug";
import { getPaths } from "./teamSlugs";
import { trophySvg } from "./trophies";

/**
 * What a season's playoff bracket is drawn with, in one place so the page (which draws a conference or a division of it inline, and needs the shape of the
 * drawing) and the file the page loads (app/bracket-svg, `seasonBracketFile`) agree. `keep` is the series of one conference's half (a bracket of its own, no
 * champion), `dims` the series a chosen division fades (`ko-dim`), `finalSeries` the one that is never faded.
 */
export function seasonBracketOptions(p: {
  lg: string; year: number; locale: Locale; paths: TeamPaths; series: readonly Series[]; names: readonly string[];
  keep?: readonly number[] | null; dims?: (s: Series) => boolean; finalSeries?: Series | null; lastRound?: number;
}): KnockoutOptions {
  const { lg, year, series, keep = null } = p;
  const tieAt = (k: number) => series[keep ? keep[k] : k];
  const options = {
    locale: p.locale, roundNames: keep ? p.names.slice(0, p.lastRound ?? 0) : [...p.names],
    href: (t: { index: number }) => seriesPath(p.paths, lg, year, tieAt(t.index)),
    tieClass: (t: { index: number }) => (p.dims?.(tieAt(t.index)) && tieAt(t.index) !== p.finalSeries ? "ko-dim" : null),
    ...(keep ? { champion: false } : { trophy: trophySvg(lg) }),
    ...knockoutLook(lg),
  };
  return options;
}

/** The NBA's play-in, drawn under its bracket. */
export const playInOptions = (locale: Locale): KnockoutOptions => ({ locale, layout: "playin", seeds: true });

export type BracketPart = "wide" | "phone" | "inwide" | "inphone";

/**
 * The SVG of one part of a season's whole bracket (no conference or division chosen) or of its play-in, standing on its own (its own marks and stylesheet), for the
 * file /bracket-svg/<league>-<year>.<part>.<language>.svg. Null when the season has no such drawing. The same reads the season page makes (the data cache holds them).
 */
export async function seasonBracketFile(lg: string, year: number, locale: Locale, part: BracketPart): Promise<string | null> {
  const sp = speaker(locale);
  const [{ series, names, bracket, playIn }, paths] = await Promise.all([loadPlayoffs(lg, year, roundSay(sp)), getPaths()]);
  if (!series.length) return null;
  if (part === "wide" || part === "phone") return drawKnockoutFiles(bracket, seasonBracketOptions({ lg, year, locale, paths, series, names }))[part];
  const layout = await playIn();
  if (!layout) return null;
  const art = drawKnockoutFiles(layout.layout, playInOptions(locale));
  return part === "inwide" ? art.wide : art.phone;
}
