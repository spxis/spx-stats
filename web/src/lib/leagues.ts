export const LEAGUE_CODES = ["nhl", "nba", "wnba", "mlb", "nfl", "cfl", "afl", "aafc", "nha", "pcha", "wchl", "wha"] as const;
export type LeagueCode = (typeof LEAGUE_CODES)[number];

/**
 * Every league the archive holds, in the order of the menu. A league with a PARENT is a rival or predecessor league (the AFL, the AAFC): its records are kept
 * apart and never counted as the parent's, but it is no league of its own in the menu: it hangs off its parent (the parent's page lists it, its pages carry a
 * "NFL > AFL > 1964" trail and light the parent's tab). `closed`: a league that no longer plays.
 */
export const ALL_LEAGUES: { code: LeagueCode; name: string; short: string; closed?: true }[] = [
  { code: "nhl", name: "National Hockey League", short: "NHL" },
  { code: "nba", name: "National Basketball Association", short: "NBA" },
  { code: "wnba", name: "Women's National Basketball Association", short: "WNBA" },
  { code: "mlb", name: "Major League Baseball", short: "MLB" },
  { code: "nfl", name: "National Football League", short: "NFL" },
  { code: "cfl", name: "Canadian Football League", short: "CFL" },
  { code: "afl", name: "American Football League", short: "AFL", closed: true },
  { code: "aafc", name: "All-America Football Conference", short: "AAFC", closed: true },
  { code: "nha", name: "National Hockey Association", short: "NHA", closed: true },
  { code: "pcha", name: "Pacific Coast Hockey Association", short: "PCHA", closed: true },
  { code: "wchl", name: "Western Canada Hockey League", short: "WCHL", closed: true },
  { code: "wha", name: "World Hockey Association", short: "WHA", closed: true },
];

/** The league a rival or predecessor league belongs under. One place: the menu, the parent's "Other leagues" section and the trail all read it. */
export const PARENT: Partial<Record<LeagueCode, LeagueCode>> = { afl: "nfl", aafc: "nfl", nha: "nhl", pcha: "nhl", wchl: "nhl", wha: "nhl" };

/** The leagues of the menu and of every league picker: the ones with no parent. */
export const LEAGUES = ALL_LEAGUES.filter((l) => !(l.code in PARENT));

/** A league's rival and predecessor leagues, oldest first. */
export const CHILDREN: Partial<Record<LeagueCode, readonly LeagueCode[]>> = Object.fromEntries(
  LEAGUES.flatMap((l) => {
    const kids = ALL_LEAGUES.filter((k) => PARENT[k.code] === l.code).map((k) => k.code);
    return kids.length ? [[l.code, kids] as const] : [];
  }),
);

/** The menu league a league's pages belong under: itself, or its parent. */
export const topLeague = (code: string): string => PARENT[code as LeagueCode] ?? code;

export const leagueInfo = (code: string) => ALL_LEAGUES.find((l) => l.code === code);

export const LG: Record<LeagueCode, string> = { nhl: "NHL", nba: "NBA", wnba: "WNBA", mlb: "MLB", nfl: "NFL", cfl: "CFL", afl: "AFL", aafc: "AAFC", nha: "NHA", pcha: "PCHA", wchl: "WCHL", wha: "WHA" };

/**
 * The first NFL season whose last game is a Super Bowl between the league's two conference champions (Super Bowl V, in January 1971). Before that the
 * NFL's last game is its own championship game, 1920-1969 (the one a final was the "NFL Championship"; the AFL played its own: "AFL Championship").
 * The AFL-NFL World Championship Games of 1966-1969 (Super Bowls I-IV) join two leagues, so neither league's season holds them.
 */
export const SUPER_BOWL_SINCE = 1970;

/** The leagues a franchise can have seasons in besides the page's own: a club's page points to its seasons there (the AAFC's Browns, the AFL's Oilers). */
export const RELATED_LEAGUES: Partial<Record<LeagueCode, readonly LeagueCode[]>> = Object.fromEntries(
  ALL_LEAGUES.flatMap((l) => {
    const rel = [...(CHILDREN[l.code] ?? []), ...(PARENT[l.code] ? [PARENT[l.code]!] : [])];
    return rel.length ? [[l.code, rel] as const] : [];
  }),
);

export function isLeague(code: string): code is LeagueCode {
  return (LEAGUE_CODES as readonly string[]).includes(code);
}

/** The leagues whose seasons span two calendar years: 1993-94 (the NHL, the NBA and the hockey leagues beside the NHL). The others are one: 2025. */
const TWO_YEAR_SEASONS: ReadonlySet<string> = new Set(["nhl", "nba", "nha", "pcha", "wchl", "wha"]);

/** NHL and NBA seasons span two calendar years: 1993-94. The others are one: 2025. */
export function seasonLabel(lg: string, y: number): string {
  return TWO_YEAR_SEASONS.has(lg) ? `${y}-${String(y + 1).slice(2)}` : String(y);
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
