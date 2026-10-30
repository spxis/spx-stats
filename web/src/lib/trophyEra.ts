/* Which trophy a season's title or conference final is drawn with. Pure (no drawing code), so the server (lib/cups.ts), the browser (lib/trophyTurn.ts) and a node
   script can all use it. A season is the site's own year: the first year of a split-year season, so the NBA's 2023-24 is 2023. A trophy that did not exist that
   season is never drawn: the answer is null. */
import type { PhraseKey } from "./i18n/phrases.constants.ts";

/** The NBA's Larry O'Brien Trophy replaced the Walter A. Brown Trophy for the 1977-78 season. Before it the Finals trophy is not drawn. */
export const NBA_OBRIEN_SINCE = 1977;
/** The 2022 redesign of the NBA's postseason trophies (the Finals of June 2022, the 2021-22 season). */
export const NBA_REDESIGN_SINCE = 2021;
/** The NBA first gave its conference champions a trophy in the 2001 playoffs (the 2000-01 season). */
export const NBA_CONFERENCE_SINCE = 2000;
/** The NFL's conference champions have received the George Halas and Lamar Hunt trophies since the 1984-85 playoffs (the 1984 season). */
export const NFL_CONFERENCE_SINCE = 1984;

/** The conference a conference final is played in: the NBA's two and the NFL's two. */
export type ConferenceSide = "west" | "east" | "nfc" | "afc";

/** One drawing of a trophy that depends on the season: a league's title trophy or a conference trophy. */
export type EraTrophy =
  | "nba" | "nba-1977"
  | "nba-west" | "nba-west-2001" | "nba-east" | "nba-east-2001"
  | "nfc" | "afc";

/** The phrase that names each trophy. */
export const ERA_TROPHY_NAME = {
  "nba": "trophy.name.nba", "nba-1977": "trophy.name.nba",
  "nba-west": "trophy.name.nbaWest", "nba-west-2001": "trophy.name.nbaWest2001",
  "nba-east": "trophy.name.nbaEast", "nba-east-2001": "trophy.name.nbaEast2001",
  "nfc": "trophy.name.nfc", "afc": "trophy.name.afc",
} as const satisfies Record<EraTrophy, PhraseKey>;

/**
 * The drawing of a league's title trophy in a season, as a key of lib/cups.ts: the NBA's two Larry O'Brien designs (1977-78 to 2020-21, then the 2022 one; none before
 * 1977-78), and for any other league its own key. With no year, the trophy of today. Null when the league's trophy did not exist that season.
 */
export function titleTrophyKey(lg: string, year?: number): string | null {
  if (lg !== "nba" || year == null) return lg;
  if (year < NBA_OBRIEN_SINCE) return null;
  return year < NBA_REDESIGN_SINCE ? "nba-1977" : "nba";
}

/** The trophy a conference final's winner lifts, or null: before the trophies existed, in a league that has none drawn, or when the conference is not known. */
export function conferenceTrophyKey(lg: string, year: number, side: ConferenceSide | null | undefined): EraTrophy | null {
  if (!side) return null;
  if (lg === "nba" && (side === "west" || side === "east")) {
    if (year < NBA_CONFERENCE_SINCE) return null;
    return year < NBA_REDESIGN_SINCE ? `nba-${side}-2001` : `nba-${side}`;
  }
  if (lg === "nfl" && (side === "nfc" || side === "afc")) return year >= NFL_CONFERENCE_SINCE ? side : null;
  return null;
}

/** Whether a league and season give a conference trophy at all, to skip reading a season's conferences when none could be drawn. */
export const hasConferenceTrophy = (lg: string, year: number): boolean =>
  (lg === "nba" && year >= NBA_CONFERENCE_SINCE) || (lg === "nfl" && year >= NFL_CONFERENCE_SINCE);

/** A standings row's conference as a side: "West", "East", "NFC" and "AFC" (the short names the archive holds), or null for any other. */
export function conferenceSide(lg: string, short: string | null | undefined): ConferenceSide | null {
  const s = (short ?? "").trim().toLowerCase().replace(/ conference$/, "");
  if (lg === "nba") return s === "west" || s === "western" ? "west" : s === "east" || s === "eastern" ? "east" : null;
  if (lg === "nfl") return s === "nfc" ? "nfc" : s === "afc" ? "afc" : null;
  return null;
}

/** A franchise's conference side in a season, from the season's standings rows (null when it is not in them, or its conference is not one of the four). */
export function sideLookup(lg: string, rows: readonly { franchise_id: number; conference_short?: string | null; conference?: string | null }[] | null | undefined): (franchise: number | null) => ConferenceSide | null {
  const by = new Map((rows ?? []).map((r) => [r.franchise_id, conferenceSide(lg, r.conference_short ?? r.conference)]));
  return (f) => (f == null ? null : by.get(f) ?? null);
}
