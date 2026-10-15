export const LEAGUE_CODES = ["nhl", "nba", "mlb", "nfl", "cfl", "afl", "aafc"] as const;
export type LeagueCode = (typeof LEAGUE_CODES)[number];

/** `closed`: a league that no longer plays (the AFL, 1960-1969; the AAFC, 1946-1949). Its clubs that played on are today's franchises, which keep its seasons in their histories. */
export const LEAGUES: { code: LeagueCode; name: string; short: string; closed?: true }[] = [
  { code: "nhl", name: "National Hockey League", short: "NHL" },
  { code: "nba", name: "National Basketball Association", short: "NBA" },
  { code: "mlb", name: "Major League Baseball", short: "MLB" },
  { code: "nfl", name: "National Football League", short: "NFL" },
  { code: "cfl", name: "Canadian Football League", short: "CFL" },
  { code: "afl", name: "American Football League", short: "AFL", closed: true },
  { code: "aafc", name: "All-America Football Conference", short: "AAFC", closed: true },
];

export const LG: Record<LeagueCode, string> = { nhl: "NHL", nba: "NBA", mlb: "MLB", nfl: "NFL", cfl: "CFL", afl: "AFL", aafc: "AAFC" };

/**
 * The first NFL season whose last game is a Super Bowl between the league's two conference champions (Super Bowl V, in January 1971). Before that the
 * NFL's last game is its own championship game, 1920-1969 (the one a final was the "NFL Championship"; the AFL played its own: "AFL Championship").
 * The AFL-NFL World Championship Games of 1966-1969 (Super Bowls I-IV) join two leagues, so neither league's season holds them.
 */
export const SUPER_BOWL_SINCE = 1970;

/** The leagues a franchise can have seasons in besides the page's own: a club's page points to its seasons there (the AAFC's Browns, the AFL's Oilers). */
export const RELATED_LEAGUES: Partial<Record<LeagueCode, readonly LeagueCode[]>> = {
  nfl: ["afl", "aafc"], afl: ["nfl"], aafc: ["nfl"],
};

export function isLeague(code: string): code is LeagueCode {
  return (LEAGUE_CODES as readonly string[]).includes(code);
}

/** NHL and NBA seasons span two calendar years: 1993-94. The others are one: 2025. */
export function seasonLabel(lg: string, y: number): string {
  return lg === "nhl" || lg === "nba" ? `${y}-${String(y + 1).slice(2)}` : String(y);
}

/** Display names of the sources the archive draws on (proper names; `srcName` adds the two that are words). */
export const SRC: Record<string, string> = {
  spx: "SPX", spx_database: "SPX", spxn_database: "SPX", spx_files: "SPX", retrosheet: "Retrosheet", nflverse: "nflverse",
  wikidata: "Wikidata", wikipedia: "Wikipedia", wikipedia_daily: "Wikipedia", wikimedia_commons: "Wikimedia Commons", nhl_api: "NHL", lahman: "Lahman",
};

/** A source's name in the reader's language: the proper names as they are, "From results" and "Editorial" translated. */
export function srcName(say: (key: "source.derived" | "source.editorial") => string, code: string | null | undefined): string {
  if (!code) return "";
  if (code === "spx_stats_derived") return say("source.derived");
  if (code === "editorial") return say("source.editorial");
  return SRC[code] || code;
}

/** SPX's own databases, scraper store and published files are one source: SPX. */
export const isSpx = (s: string | null | undefined): boolean => !!s && s.startsWith("spx") && s !== "spx_stats_derived";

export const SITE_URL = "https://spxn.com";
