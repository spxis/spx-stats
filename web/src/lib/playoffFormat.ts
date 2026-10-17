/**
 * What each league's playoffs looked like in a given year: the names of the rounds, in order, and how many games a series
 * was played to. Pure (no imports), so a node script can test it. The rounds themselves are worked out from the games
 * (series.ts assignRounds); this table only says what a season with that many rounds called them. A season whose round
 * count matches no row here keeps the generic names (Round 1, Quarterfinals, Semifinals, the final).
 */

export type RoundKey =
  | "first" | "second" | "prelim" | "qual" | "quarters" | "semis"
  | "divSemis" | "divFinals" | "confQuarters" | "confSemis" | "confFinal" | "confFinals" | "scSemis"
  | "tiebreak" | "wcGame" | "wcSeries" | "ds" | "lcs"
  | "wildcard" | "divisional" | "confChamp"
  | "cflSemi" | "cflFinal"
  /** The league's last round: Stanley Cup Final, NBA Finals, World Series, Super Bowl, Grey Cup. */
  | "final";

/** [first year, last year, round keys]. The first row that covers the year and fits the number of rounds wins. */
const ERAS: Record<string, readonly (readonly [number, number, readonly RoundKey[]])[]> = {
  nhl: [
    [2019, 2019, ["qual", "first", "second", "confFinal", "final"]],
    [2020, 2020, ["first", "second", "scSemis", "final"]],
    [2014, 9999, ["first", "second", "confFinal", "final"]],
    [1994, 2013, ["confQuarters", "confSemis", "confFinal", "final"]],
    [1982, 1993, ["divSemis", "divFinals", "confFinal", "final"]],
    [1974, 1981, ["prelim", "quarters", "semis", "final"]],
  ],
  pwhl: [
    [2023, 9999, ["semis", "final"]],
  ],
  nba: [
    [1974, 9999, ["first", "confSemis", "confFinals", "final"]],
    [1967, 1973, ["divSemis", "divFinals", "final"]],
  ],
  wnba: [
    [2022, 9999, ["first", "semis", "final"]],
    [2016, 2021, ["confSemis", "confFinals", "final"]],
    [2000, 2015, ["first", "confFinals", "final"]],
    [1997, 1999, ["semis", "final"]],
  ],
  mlb: [
    [2008, 2008, ["tiebreak", "ds", "lcs", "final"]],
    [2020, 2020, ["wcSeries", "ds", "lcs", "final"]],
    [2022, 9999, ["wcSeries", "ds", "lcs", "final"]],
    [2012, 2021, ["wcGame", "ds", "lcs", "final"]],
    [1995, 2011, ["ds", "lcs", "final"]],
    [1981, 1981, ["ds", "lcs", "final"]],
    [1969, 1993, ["lcs", "final"]],
  ],
  nfl: [
    [1982, 1982, ["first", "second", "confChamp", "final"]],
    [1978, 9999, ["wildcard", "divisional", "confChamp", "final"]],
    [1970, 1977, ["divisional", "confChamp", "final"]],
  ],
  cfl: [
    [1973, 9999, ["cflSemi", "cflFinal", "final"]],
  ],
  nwsl: [
    [2024, 9999, ["quarters", "semis", "final"]],
    [2021, 2023, ["first", "semis", "final"]],
    [2013, 2019, ["semis", "final"]],
  ],
};

/**
 * The names (as keys) of a season's rounds, round 1 first, or null when the table has no row for the league, year and
 * number of rounds. `single`: the last round holds one series, so it can be the league's final (a row that ends in the
 * final fits `count` rounds only then). `open`: the season is still being played, so it has fewer rounds than it will
 * and a longer row also fits, its first rounds used.
 */
export function roundKeys(lg: string, year: number, count: number, single: boolean, open: boolean): RoundKey[] | null {
  const rows = (ERAS[lg] ?? []).filter(([from, to]) => year >= from && year <= to);
  const exact = single ? rows.find(([, , keys]) => keys.length === count) : undefined;
  if (exact) return [...exact[2]];
  const longer = open ? rows.find(([, , keys]) => keys.length > count) : undefined;
  return longer ? longer[2].slice(0, count) : null;
}

/** How many games a series of this round was played to (best of N), or null when the table does not know and it has to be read off the games. */
export function bestOfIn(lg: string, year: number, key: RoundKey): number | null {
  switch (lg) {
    case "mlb":
      if (key === "wcGame" || key === "tiebreak") return 1;
      if (key === "wcSeries") return 3;
      if (key === "ds") return 5;
      if (key === "lcs") return year >= 1985 ? 7 : 5;
      return key === "final" && year >= 1922 ? 7 : null;
    case "pwhl":
      return 5;
    case "nhl":
      if (year < 1980) return null;
      if (key === "qual") return 5;
      if (year <= 1986 && (key === "prelim" || key === "divSemis")) return 5;
      return 7;
    case "nba":
      if (year < 1984) return null;
      if (year < 2003 && key === "first") return 5;
      return 7;
    case "wnba":
      if (key === "final") return year >= 2005 ? 5 : 3;
      if (key === "first") return year >= 2022 ? 3 : (year >= 2000 ? 3 : 1);
      return year >= 2016 ? 5 : 3;
    case "nfl":
    case "cfl":
    case "nwsl":
      return 1;
    default:
      return null;
  }
}

/** Games to be played to when the format is unknown: the number of games the series has (played and scheduled), made odd. */
export const bestOfFromGames = (listed: number): number => Math.max(1, listed % 2 ? listed : listed + 1);

/** Wins that settle a best-of-N series. */
export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;
