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

/** The Vince Lombardi Trophy has had its name since Super Bowl V (the 1970 season); the same trophy of 1967 to 1969 was the World Professional Football Championship Trophy, and the title before it was the NFL Championship. */
export const NFL_LOMBARDI_SINCE = 1970;
/** The Commissioner's Trophy was first given to the winner of the 1967 World Series. Before it the winner received no trophy that is drawn here. */
export const MLB_TROPHY_SINCE = 1967;
/** Tiffany & Co.'s redesign of the Commissioner's Trophy, with 30 flags, was unveiled for the 2000 World Series; the package draws that one. 1967 to 1999 was a Balfour design with 20 to 30 flags, not drawn. */
export const MLB_REDESIGN_SINCE = 2000;
/** The NHL's Prince of Wales Trophy and Clarence S. Campbell Bowl have gone to a conference's playoff champion since the 1981-82 playoffs (before it to a division or conference's regular-season champion). */
export const NHL_CONFERENCE_SINCE = 1981;
/** The 2020-21 season had four divisions and no conferences; the winners of the two Stanley Cup semifinals (East against Central, North against West) were given the two trophies. */
export const NHL_DIVISION_YEAR = 2020;

/** The conference a conference final is played in: the NBA's and the NHL's two (the NHL's east is the Prince of Wales Trophy, its west the Campbell Bowl) and the NFL's two. */
export type ConferenceSide = "west" | "east" | "nfc" | "afc";

/** One drawing of a trophy that depends on the season: a league's title trophy or a conference trophy. */
export type EraTrophy =
  | "nba" | "nba-1977"
  | "nba-west" | "nba-west-2001" | "nba-east" | "nba-east-2001"
  | "nfc" | "afc"
  | "nhl-east" | "nhl-west"
  | "nhl" | "mlb" | "mlb-1967" | "nfl" | "nfl-pre" | "cfl";

/** The phrase that names each trophy. */
export const ERA_TROPHY_NAME = {
  "nba": "trophy.name.nba", "nba-1977": "trophy.name.nba",
  "nba-west": "trophy.name.nbaWest", "nba-west-2001": "trophy.name.nbaWest2001",
  "nba-east": "trophy.name.nbaEast", "nba-east-2001": "trophy.name.nbaEast2001",
  "nfc": "trophy.name.nfc", "afc": "trophy.name.afc",
  "nhl-east": "trophy.name.nhlEast", "nhl-west": "trophy.name.nhlWest",
  "nhl": "trophy.name.nhl", "mlb": "trophy.name.mlb", "mlb-1967": "trophy.name.mlbOld", "nfl": "trophy.name.nfl", "nfl-pre": "rnd.nflOld", "cfl": "trophy.name.cfl",
} as const satisfies Record<EraTrophy, PhraseKey>;

/**
 * The drawing of a league's title trophy in a season, as a key of lib/cups.ts: the NBA's two Larry O'Brien designs (1977-78 to 2020-21, then the 2022 one; none before
 * 1977-78), the NFL's Vince Lombardi Trophy from the 1970 season (the football cup before it, for the NFL Championship), MLB's Commissioner's Trophy in the design of 2000 on (the
 * baseball cup for 1967 to 1999, whose design the package does not draw, and nothing before 1967), and for any other league its own key (the Stanley Cup, the Grey Cup). With no
 * year, the trophy of today. Null when the league's trophy did not exist that season.
 */
export function titleTrophyKey(lg: string, year?: number): string | null {
  if (year == null) return lg;
  if (lg === "nba") return year < NBA_OBRIEN_SINCE ? null : year < NBA_REDESIGN_SINCE ? "nba-1977" : "nba";
  if (lg === "nfl") return year < NFL_LOMBARDI_SINCE ? "nfl-pre" : "nfl";
  if (lg === "mlb") return year < MLB_TROPHY_SINCE ? null : year < MLB_REDESIGN_SINCE ? "mlb-1967" : "mlb";
  return lg;
}

/** The trophy a conference final's winner lifts, or null: before the trophies existed, in a league that has none drawn, or when the conference is not known. */
export function conferenceTrophyKey(lg: string, year: number, side: ConferenceSide | null | undefined): EraTrophy | null {
  if (!side) return null;
  if (lg === "nba" && (side === "west" || side === "east")) {
    if (year < NBA_CONFERENCE_SINCE) return null;
    return year < NBA_REDESIGN_SINCE ? `nba-${side}-2001` : `nba-${side}`;
  }
  if (lg === "nfl" && (side === "nfc" || side === "afc")) return year >= NFL_CONFERENCE_SINCE ? side : null;
  if (lg === "nhl" && (side === "west" || side === "east")) return year >= NHL_CONFERENCE_SINCE ? `nhl-${side}` : null;
  return null;
}

/** Whether a league and season give a conference trophy at all, to skip reading a season's conferences when none could be drawn. */
export const hasConferenceTrophy = (lg: string, year: number): boolean =>
  (lg === "nba" && year >= NBA_CONFERENCE_SINCE) || (lg === "nfl" && year >= NFL_CONFERENCE_SINCE) || (lg === "nhl" && year >= NHL_CONFERENCE_SINCE);

/** A standings row's conference as a side: "West", "East", "NFC" and "AFC" (the short names the archive holds), or null for any other. */
export function conferenceSide(lg: string, short: string | null | undefined): ConferenceSide | null {
  const s = (short ?? "").trim().toLowerCase().replace(/ conference$/, "");
  if (lg === "nba") return s === "west" || s === "western" ? "west" : s === "east" || s === "eastern" ? "east" : null;
  if (lg === "nfl") return s === "nfc" ? "nfc" : s === "afc" ? "afc" : null;
  // The NHL's conferences were named for the trophies of 1974 to 1993 (Prince of Wales in the east, Clarence Campbell in the west) and the compass after.
  if (lg === "nhl") return /^(prince of )?wales$|^east(ern)?$/.test(s) ? "east" : /^(clarence )?campbell$|^west(ern)?$/.test(s) ? "west" : null;
  return null;
}

/** The NHL's four divisions of 2020-21 as the side whose semifinal winner took the Prince of Wales Trophy (East, Central) or the Campbell Bowl (North, West). */
const DIVISION_SIDE: Record<string, ConferenceSide> = { east: "east", central: "east", north: "west", west: "west" };

/** A franchise's conference side in a season, from the season's standings rows (null when it is not in them, or its conference is not one of the four). */
export function sideLookup(lg: string, rows: readonly { franchise_id: number; year?: number; conference_short?: string | null; conference?: string | null; division_short?: string | null; division?: string | null }[] | null | undefined): (franchise: number | null) => ConferenceSide | null {
  const division = (r: { year?: number; division_short?: string | null; division?: string | null }): ConferenceSide | null =>
    lg === "nhl" && r.year === NHL_DIVISION_YEAR ? DIVISION_SIDE[(r.division_short ?? r.division ?? "").trim().toLowerCase().replace(/ division$/, "")] ?? null : null;
  const by = new Map((rows ?? []).map((r) => [r.franchise_id, conferenceSide(lg, r.conference_short ?? r.conference) ?? division(r)]));
  return (f) => (f == null ? null : by.get(f) ?? null);
}
