/**
 * The sides of an All-Star Game as the pages draw them: a club (its logo that season, its brand colours, a link) or a side that is no club (East, the American League,
 * Team McDavid: a monogram on a colour). Pure: the club lookups come in as `Look`, which `getClubs` (lib/allStar.ts) answers.
 */
import type { TeamBrandRow } from "./api/types";
import { cleanSide, monogram, sideColours, type GameSide } from "./allStarView.ts";
import { seriesLooks, type SideLook } from "./seriesLooks.ts";

/** What a side needs of the clubs of a season. */
export interface Look {
  logo(f: number | null | undefined, year: number | null): string | null;
  brand(f: number | null | undefined, year: number | null): TeamBrandRow | null;
}

export interface SideView {
  name: string;
  /** The club behind the side (a franchise id) or null. */
  f: number | null;
  /** The logo the club wore that season; null for a side that is no club or a club with no logo held. */
  logo: string | null;
  /** The letters of the monogram a side with no logo is drawn with. */
  mono: string;
  /** The colour (hex, no #) of a side that is no club; null for a club (its brand colours are used). */
  hue: string | null;
  brand: TeamBrandRow | null;
  score: number;
}

/** A side as a view; `hue` is the colour a side that is no club takes (see `sideColours`). */
export function sideView(look: Look, year: number | null, s: Pick<GameSide, "name" | "score" | "franchise">, hue: string | null): SideView {
  const f = s.franchise;
  return { name: cleanSide(s.name), f, logo: f != null ? look.logo(f, year) : null, mono: monogram(s.name), hue: f != null ? null : hue, brand: f != null ? look.brand(f, year) : null, score: s.score };
}

/** The two sides of a drawing with the colours of each (the clubs' brand colours, or the colour of a side that is no club) worked out so the two read apart (lib/seriesLooks.ts). */
export function looksOf(lg: string, a: SideView, b: SideView): [SideLook, SideLook] {
  const col = (s: SideView) => (s.brand ?? (s.hue ? { primary_hex: s.hue, secondary_hex: null } : null));
  return seriesLooks(lg, col(a), col(b));
}

/** The views of the two sides of one game, in the order given, with colours for the sides that are no club. */
export function sidePair(look: Look, year: number | null, left: GameSide, right: GameSide): [SideView, SideView] {
  const [hl, hr] = sideColours([left.name, right.name]);
  return [sideView(look, year, left, hl), sideView(look, year, right, hr)];
}
