export const LEAGUE_CODES = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;
export type LeagueCode = (typeof LEAGUE_CODES)[number];

export const LEAGUES: { code: LeagueCode; name: string; short: string }[] = [
  { code: "nhl", name: "National Hockey League", short: "NHL" },
  { code: "nba", name: "National Basketball Association", short: "NBA" },
  { code: "mlb", name: "Major League Baseball", short: "MLB" },
  { code: "nfl", name: "National Football League", short: "NFL" },
  { code: "cfl", name: "Canadian Football League", short: "CFL" },
];

export const LG: Record<LeagueCode, string> = { nhl: "NHL", nba: "NBA", mlb: "MLB", nfl: "NFL", cfl: "CFL" };

export function isLeague(code: string): code is LeagueCode {
  return (LEAGUE_CODES as readonly string[]).includes(code);
}

/** NHL and NBA seasons span two calendar years: 1993-94. The others are one: 2025. */
export function seasonLabel(lg: string, y: number): string {
  return lg === "nhl" || lg === "nba" ? `${y}-${String(y + 1).slice(2)}` : String(y);
}

/** Display names of the sources the archive draws on. */
export const SRC: Record<string, string> = {
  spx: "SPX", spx_database: "SPX", spxn_database: "SPX", spx_files: "SPX", retrosheet: "Retrosheet", nflverse: "nflverse",
  wikidata: "Wikidata", nhl_api: "NHL", spx_stats_derived: "From results", editorial: "Editorial",
};

/** SPX's own databases, scraper store and published files are one source: SPX. */
export const isSpx = (s: string | null | undefined): boolean => !!s && s.startsWith("spx") && s !== "spx_stats_derived";

export const SITE_URL = "https://spxn.com";
