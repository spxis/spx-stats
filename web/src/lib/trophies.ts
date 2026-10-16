/* The phrase that names each league's championship trophy. The drawings are in lib/cups.ts, from John's package @johnmorrisdotca/dougu-sports (MIT):
   its generic cups, which suggest the trophy rather than reproduce it. Credited on /terms. */
import type { PhraseKey } from "./i18n/phrases.constants.ts";
import { SUPER_BOWL_SINCE } from "./leagues.ts";

/** The phrase that names a league's trophy (shown beside it and as its label); the five leagues only. */
export const TROPHY_NAME = {
  nhl: "trophy.name.nhl", nba: "trophy.name.nba", wnba: "trophy.name.wnba", mlb: "trophy.name.mlb", nfl: "trophy.name.nfl", cfl: "trophy.name.cfl",
} as const satisfies Record<string, PhraseKey>;

/**
 * The phrase that names the trophy of a league's season: the NFL's was the "NFL Championship" before the Super Bowl between the conferences'
 * champions (1970), not the Vince Lombardi Trophy. With no year, the league's trophy today. Null for a league with no cup here (the AFL).
 */
export function trophyPhrase(lg: string, year?: number): PhraseKey | null {
  if (!(lg in TROPHY_NAME)) return null;
  if (lg === "nfl" && year != null && year < SUPER_BOWL_SINCE) return "rnd.nflOld";
  return TROPHY_NAME[lg as keyof typeof TROPHY_NAME];
}

/** What a league's championship was called in a season. The archive keeps one NFL award, "Super Bowl"; before 1970 the title was the NFL Championship. */
export function championshipName(lg: string, year: number, name: string): string {
  return lg === "nfl" && year < SUPER_BOWL_SINCE ? "NFL Championship" : name;
}
