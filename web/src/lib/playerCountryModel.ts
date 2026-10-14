/**
 * "Where the players come from" on /players: the shaping of the counts, with no server code so a node script can test it.
 * The counts are the players the list shows (the league, years, letter and search chosen, but not the country, so the chips and the map still
 * offer every country) by country of birth, else nationality; UNKNOWN stands for "not on record" and is never guessed.
 */
import { isKnown, share, tally, UNKNOWN, withOther, type Count, type LeagueCount } from "./countryModel.ts";
import { isLeague } from "./leagues.ts";
import { positionCode } from "./positions.ts";

export type Tally = ReturnType<typeof tally>;

/** A row of api.player_countries (migration 096): a country code (null or ZZ when unknown) and its players. */
export interface CountryRow { country: string | null; n: number }

/** The choices under which the countries are counted: the same as the players list except the country itself. */
export interface CountryFilters {
  league?: string; words?: readonly string[]; position?: string; from?: number; to?: number;
  /** One letter a to z, of the last name (or of the first name with letterBy "first"). */
  letter?: string; letterBy?: "last" | "first";
  /** A franchise id: only players who ever played for it (migration 098). */
  team?: number;
}

/** The query string of the api.player_countries call; a choice that is not set is left out. */
export function countryArgs(f: CountryFilters): string {
  return [
    `p_by=${f.letterBy === "first" ? "first" : "last"}`,
    f.league && isLeague(f.league) ? `p_league=${f.league}` : "",
    f.letter && /^[a-zA-Z]$/.test(f.letter) ? `p_letter=${f.letter.toLowerCase()}` : "",
    f.position ? `p_position=${encodeURIComponent(positionCode(f.position) ?? f.position)}` : "",
    f.from !== undefined ? `p_from=${f.from}` : "",
    f.to !== undefined ? `p_to=${f.to}` : "",
    f.words?.length ? `p_q=${encodeURIComponent(f.words.join(" "))}` : "",
    f.team !== undefined ? `p_franchise=${f.team}` : "",
  ].filter(Boolean).join("&");
}

/** True when the choices are only a league (or none): then the all-time country views answer without the new function. */
export const isPlainLeague = (f: CountryFilters): boolean =>
  f.from === undefined && f.to === undefined && !f.letter && !f.position && !f.words?.length && f.team === undefined;

/** The counts of the function's rows, best first, the unknown ones apart. */
export const fromRows = (rows: readonly CountryRow[]): Tally => tally(rows.map((r) => [r.country || UNKNOWN, r.n] as [string, number]));

/**
 * The counts from api.country_league (one row per league and country): one league, or every league added up (a player of two leagues counts in both).
 * The players with no country are the league's players less those with one, so they are counted even where the view has no row for them.
 */
export function fromLeagueRows(rows: readonly LeagueCount[], league = ""): Tally {
  const pairs: [string, number][] = [];
  const seen = new Set<string>();
  let unknown = 0;
  for (const r of rows) {
    if (league && r.league !== league) continue;
    if (isKnown(r.country)) pairs.push([r.country, r.players]);
    if (!seen.has(r.league)) { seen.add(r.league); unknown += Math.max(0, r.league_players - r.league_known); }
  }
  if (unknown) pairs.push([UNKNOWN, unknown]);
  return tally(pairs);
}

/** Too few players with a country to draw anything (under a tenth), or enough to draw but not to compare (under half). */
export const coverage = (t: Tally): "none" | "low" | "ok" => (t.known === 0 || t.known < 0.1 * t.total ? "none" : t.known < 0.5 * t.total ? "low" : "ok");

/**
 * The chips: the `keep` biggest countries, with the chosen country always among them (in the place of the last when it is not big enough),
 * and the rest for the "more" list. A chosen country with no players under the choices is not offered.
 */
export function chipSplit(list: readonly Count[], chosen: string, keep = 8): { shown: Count[]; more: Count[] } {
  let shown = list.slice(0, keep);
  const pick = chosen ? list.find((c) => c.code === chosen) : undefined;
  if (pick && !shown.includes(pick)) shown = [...shown.slice(0, Math.max(keep - 1, 0)), pick];
  return { shown, more: list.filter((c) => !shown.includes(c)) };
}

/** One slice of the donut: the `keep` biggest countries (each its own colour slot), the others together, and the unknown ones. */
export interface PlayerSlice { code: string; n: number; kind?: "country" | "other" | "unknown"; slot?: number; members?: string[] }
export function slicesOf(t: Tally, keep = 6): PlayerSlice[] {
  const { top, other } = withOther(t.list, keep);
  return [
    ...top.map((c, i) => ({ code: c.code, n: c.n, slot: i })),
    ...(other ? [{ code: "other", n: other, kind: "other" as const, members: t.list.slice(keep).map((c) => c.code) }] : []),
    ...(t.unknown ? [{ code: UNKNOWN, n: t.unknown, kind: "unknown" as const }] : []),
  ];
}

export interface Against { code: string; mine: number; theirs: number }

/** For the `count` biggest countries of the list: its share of the players whose country is known, and the reference's. Empty where either has no known players. */
export function against(mine: Tally, reference: Tally, count = 5): Against[] {
  if (!mine.known || !reference.known) return [];
  const ref = new Map(reference.list.map((c) => [c.code, c.n]));
  return mine.list.slice(0, count).map((c) => ({ code: c.code, mine: share(c.n, mine.known), theirs: share(ref.get(c.code) ?? 0, reference.known) }));
}

/** What the bars are set against: all the leagues when one league is chosen over its whole history; that league's whole history when a range of years narrows it. */
export function referenceOf(f: CountryFilters): "leagues" | "league" | null {
  if (!f.league || !isLeague(f.league)) return null;
  return f.from === undefined && f.to === undefined ? "leagues" : "league";
}
