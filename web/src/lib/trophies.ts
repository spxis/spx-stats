/* The phrase that names each league's championship trophy. The drawings are in lib/cups.ts, from John's package @johnmorrisdotca/dougu-sports (MIT):
   its generic cups, which suggest the trophy rather than reproduce it. Credited on /terms. */
import type { PhraseKey } from "./i18n/phrases.constants.ts";
import { SUPER_BOWL_SINCE } from "./leagues.ts";
import { conferenceTrophyKey, ERA_TROPHY_NAME, NBA_OBRIEN_SINCE, type ConferenceSide } from "./trophyEra.ts";

/** The phrase that names a league's trophy (shown beside it and as its label): the leagues whose cup has a drawing of its own in the package. */
export const TROPHY_NAME = {
  nhl: "trophy.name.nhl", pwhl: "trophy.name.pwhl", nba: "trophy.name.nba", wnba: "trophy.name.wnba", mlb: "trophy.name.mlb", nfl: "trophy.name.nfl", cfl: "trophy.name.cfl", nwsl: "trophy.name.nwsl",
  nha: "trophy.name.nha", pcha: "trophy.name.pcha", wha: "trophy.name.wha",
} as const satisfies Record<string, PhraseKey>;

/**
 * The phrase that names the trophy of a league's season: the NFL's was the "NFL Championship" before the Super Bowl between the conferences'
 * champions (1970), not the Vince Lombardi Trophy, and the NBA has no Larry O'Brien Trophy before 1977-78 (lib/trophyEra.ts). With no year, the league's trophy today. Null for a
 * league with no cup here (the AFL).
 */
export function trophyPhrase(lg: string, year?: number): PhraseKey | null {
  if (!(lg in TROPHY_NAME)) return null;
  if (lg === "nfl" && year != null && year < SUPER_BOWL_SINCE) return "rnd.nflOld";
  if (lg === "nba" && year != null && year < NBA_OBRIEN_SINCE) return null;
  return TROPHY_NAME[lg as keyof typeof TROPHY_NAME];
}

/** What a league's championship was called in a season. The archive keeps one NFL award, "Super Bowl"; before 1970 the title was the NFL Championship. Its one NBA award is the Larry O'Brien Trophy, which began in 1977-78. */
export function championshipName(lg: string, year: number, name: string): string {
  if (lg === "nba" && year < NBA_OBRIEN_SINCE) return "NBA Championship";
  return lg === "nfl" && year < SUPER_BOWL_SINCE ? "NFL Championship" : name;
}

/** The leagues that also get a trophy on a big-game banner though no champion banner draws one: no champion banner draws one for them, but the banner of a big game does: the package's drawing of the Calder Cup, the Kelly Cup and the College Football Playoff trophy, named for the trophy. */
const BIG_GAME_EXTRA = { ahl: "trophy.name.ahl", echl: "trophy.name.echl", ncaaf: "trophy.name.ncaaf" } as const satisfies Record<string, PhraseKey>;

/**
 * The phrase that names the trophy a big-game banner shows for a league's season, or null when there is none to show: the leagues with a cup of their own (TROPHY_NAME) and the
 * AHL, the ECHL and college football. The NFL has none before the Super Bowl (1970), and no other league, the AFL and the AAFC among them, has a cup drawn for it.
 */
export function bigGameTrophy(lg: string, year: number): PhraseKey | null {
  if (lg in BIG_GAME_EXTRA) return BIG_GAME_EXTRA[lg as keyof typeof BIG_GAME_EXTRA];
  if (lg === "nfl" && year < SUPER_BOWL_SINCE) return null;
  return trophyPhrase(lg, year);
}

/** The phrase that names the trophy a conference final's winner lifts (the NBA's and the NFL's), or null when none existed that season or the conference is not known. */
export function conferenceTrophyPhrase(lg: string, year: number, side: ConferenceSide | null | undefined): PhraseKey | null {
  const key = conferenceTrophyKey(lg, year, side);
  return key ? ERA_TROPHY_NAME[key] : null;
}
