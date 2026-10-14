import { drawKyogijo, groundByWikidata, parkById } from "@johnmorrisdotca/kyogijo";
import type { BrandMap } from "./brand.ts";
import { parkIdFor, SURFACE_SPORT, type SurfaceSport } from "./venuePark.ts";

/**
 * A game's score drawn on the surface it was played on, with @johnmorrisdotca/kyogijo. Pure (no server-only imports) so the pages and the checks
 * share it. The drawing is a string of SVG written into the page, one per page, without its stylesheet: components/kyogijo.css holds it once, for
 * every page, and is kept in step with the package by scripts/gameSurface.test.ts. A drawing is decorative (aria-hidden); the page says the score as text.
 */

export type GameSport = SurfaceSport | "soccer";

/** The sport kyogijo draws for a league's games, or null when it draws none (the league has no surface of its own to show). */
export const sportOf = (lg: string): SurfaceSport | null => (SURFACE_SPORT as Record<string, SurfaceSport | undefined>)[lg] ?? null;

export interface GameSide {
  name: string;
  /** The short form for the strip; kyogijo takes it from the name when missing. */
  abbr?: string | null;
  score: number | null;
  /** Goals in a penalty shoot-out (soccer). */
  penalties?: number | null;
  /** The block colour behind the name, and the colour of the words on it (a hex without #). */
  color?: string | null;
  ink?: string | null;
  logo?: string | null;
}

export interface GameDrawing {
  sport: GameSport;
  /** The season (for the hockey and basketball seasons, the year it starts): the surface is marked as the rules had it then. */
  year: number | null;
  language: "en" | "ja";
  /** Who is emphasised: the leader (the default; nobody when level) or the side a shoot-out settled. */
  winner?: "leader" | "home" | "away" | "none";
  home: GameSide;
  away: GameSide;
  /** The state of the game as it is to be written, in the reader's language ("Final", "Final / OT"). */
  status: string;
  competition?: string | null;
  date?: string | null;
  /** The kyogijo key of the MLB park, and (soccer) of the ground: with none, the sport's standard surface. */
  park?: string | null;
  ground?: string | null;
}

const hex = (h: string | null | undefined) => (h && /^[0-9a-fA-F]{6}$/.test(h) ? `#${h}` : undefined);
const side = (s: GameSide) => ({
  name: s.name, ...(s.abbr ? { abbr: s.abbr } : {}), ...(s.score != null ? { score: s.score } : {}), ...(s.penalties != null ? { penalties: s.penalties } : {}),
  ...(hex(s.color) ? { color: hex(s.color) } : {}), ...(hex(s.ink) ? { textColor: hex(s.ink) } : {}), ...(s.logo ? { logo: s.logo } : {}),
});

/** The options kyogijo draws a game from. A football field leaves out its hash marks, as the venue pages' drawings do (half the size). */
export function gameOptions(g: GameDrawing, plain = false) {
  const park = !plain && g.sport === "mlb" ? g.park : null;
  return {
    sport: g.sport,
    language: g.language,
    size: "compact" as const,
    style: "none" as const,
    winner: g.winner ?? ("leader" as const),
    away: side(g.away),
    home: side(g.home),
    status: g.status,
    ...(g.competition ? { competition: g.competition } : {}),
    ...(g.date ? { date: g.date } : {}),
    ...(g.sport === "nfl" || g.sport === "cfl" ? { detail: "simple" as const } : {}),
    ...(park ? { park } : {}),
    ...(!plain && g.sport === "soccer" && g.ground ? { ground: g.ground } : {}),
    // Soccer is written "home first" (Spain 2–1 Belgium), as the match page's banner is; kyogijo's own default is the North American "away at home".
    ...(g.sport === "soccer" ? { homeSide: "left" as const } : {}),
    ...(g.sport !== "soccer" && g.year != null ? { year: g.year } : {}),
  };
}

/** The drawing's size in its own units (the viewBox): the page keeps the box this shape before the SVG is parsed. */
export interface Drawn { svg: string; width: number; height: number }

const drawn = new Map<string, Drawn | null>();

/**
 * The SVG of a game, ready for the page: no title or description (the drawing is decorative; the page says the score) and `aria-hidden`.
 * A park or year kyogijo cannot draw is left out and the standard surface drawn; null only when even that fails.
 */
export function drawGame(g: GameDrawing): Drawn | null {
  for (const plain of [false, true]) {
    try {
      const raw = drawKyogijo(gameOptions(g, plain));
      const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(raw);
      const svg = raw
        .replace(/ role="img" aria-labelledby="[^"]*"/, ' aria-hidden="true" focusable="false"')
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/, "")
        .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/, "");
      return { svg, width: Math.round(Number(box?.[1] ?? 400)), height: Math.round(Number(box?.[2] ?? 200)) };
    } catch {
      /* try the standard surface */
    }
  }
  return null;
}

/** `drawGame`, kept for the build: the same game on the same page's twin (the other query copy) is drawn once. */
export function drawGameOnce(g: GameDrawing): Drawn | null {
  const key = JSON.stringify(gameOptions(g));
  if (!drawn.has(key)) drawn.set(key, drawGame(g));
  return drawn.get(key) ?? null;
}

/* ---------- where it was played ---------------------------------------------------------- */

/**
 * Games whose home club's venue says nothing about where they were played: the league's championship game at a neutral site (the Super Bowl from its
 * first, the Grey Cup always) and the postseasons played in hubs and bubbles (the 2019-20 NHL and NBA, whose year is the one the season starts in, and
 * MLB's 2020). api.game_venue gives those their real venue where a source names one; this is for a game it only knows by its home club (basis `home`),
 * and for when it cannot be read.
 */
export function neutralSite(lg: string, year: number, phase: string, final: boolean): boolean {
  if (phase !== "playoffs") return false;
  if (lg === "nfl") return final && year >= 1966;
  if (lg === "cfl") return final;
  if (lg === "nhl" || lg === "nba") return year === 2019;
  return lg === "mlb" && year === 2020;
}

export interface HomeVenue { name: string; wid: string | null; current: boolean }

/** What the archive says about a venue: where a club's era puts it (api.venue_place), when it stood (api.venue_info) and its names (api.venue_name). */
export interface VenueLookup {
  place(f: number, venue: string, lat: number | null, lon: number | null): { wid: string | null; city: string | null } | null;
  span(wid: string): { opened: number | null; closed: number | null } | null;
  nameIn(wid: string, year: number, fallback: string): string;
}

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * The venue a club called home in a season, from the brand eras (api.team_brand names one on a few eras only, so the era covering the day often has none).
 * Taken: the last era covering the game's day that names a venue; failing that the era nearest to it, but only when the venue's own years (opened, closed)
 * include the season, so a park is never claimed for years it did not stand. A venue that is only a city (the Marlins' "Miami") is no venue. `current` says the
 * era has no end: only then may a name alone stand for today's park. Replaced by api.game_venue once data release 2026.10.13-20 has filled it.
 */
export function homeVenueIn(brands: BrandMap, f: number | null | undefined, day: string, year: number, look: VenueLookup): HomeVenue | null {
  if (f == null) return null;
  const named = (brands[f] ?? []).filter((b) => b.home_venue);
  const covering = named.filter((b) => (!b.brand_from || b.brand_from <= day) && (!b.brand_to || b.brand_to > day));
  const t = dayNumber(day);
  const gap = (b: (typeof named)[number]) => Math.min(b.brand_from ? Math.abs(dayNumber(b.brand_from) - t) : Infinity, b.brand_to ? Math.abs(dayNumber(b.brand_to) - t) : Infinity);
  const exact = covering.at(-1);
  const era = exact ?? [...named].sort((a, b) => gap(a) - gap(b))[0];
  if (!era?.home_venue) return null;
  const place = look.place(f, era.home_venue, era.latitude, era.longitude);
  const wid = place?.wid ?? null;
  if (place?.city && place.city === era.home_venue) return null;
  if (!exact) {
    const span = wid ? look.span(wid) : null;
    if (!span || span.opened == null || span.opened > year || (span.closed != null && span.closed < year)) return null;
  }
  return { name: wid ? look.nameIn(wid, year, era.home_venue) : era.home_venue, wid, current: !era.brand_to };
}

/** Whether a kyogijo park was in use in a season (a past park is held to the seasons it was used). */
export const parkFits = (park: string | null, year: number): boolean => {
  const p = park ? parkById(park) : undefined;
  return !!p && year >= (p.from ?? 0) && year <= (p.to ?? 9999);
};

/** The kyogijo park an MLB club's home venue is, or null (the standard field). */
export const parkOf = (v: HomeVenue | null): string | null => (v ? parkIdFor([v.name], v.current, v.wid) : null);

/** The kyogijo ground (soccer) a Wikidata id names, or null (the standard pitch). */
export const groundOf = (wikidata: string | null | undefined): string | null => (wikidata ? groundByWikidata(wikidata)?.id ?? null : null);
