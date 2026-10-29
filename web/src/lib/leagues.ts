export const LEAGUE_CODES = ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "ncaaf", "cfl", "nwsl", "afl", "aafc", "nha", "pcha", "wchl", "wha", "ahl", "na", "aa", "ua", "pl", "fl"] as const;
export type LeagueCode = (typeof LEAGUE_CODES)[number];

/**
 * Every league the archive holds, in the order of the menu. A league with a PARENT is a rival or predecessor league (the AFL, the AAFC): its records are kept
 * apart and never counted as the parent's, but it is no league of its own in the menu: it hangs off its parent (the parent's page lists it, its pages carry a
 * "NFL > AFL > 1964" trail and light the parent's tab). `closed`: a league that no longer plays.
 */
export const ALL_LEAGUES: { code: LeagueCode; name: string; short: string; closed?: true }[] = [
  { code: "nhl", name: "National Hockey League", short: "NHL" },
  { code: "pwhl", name: "Professional Women's Hockey League", short: "PWHL" },
  { code: "nba", name: "National Basketball Association", short: "NBA" },
  { code: "wnba", name: "Women's National Basketball Association", short: "WNBA" },
  { code: "mlb", name: "Major League Baseball", short: "MLB" },
  { code: "nfl", name: "National Football League", short: "NFL" },
  { code: "ncaaf", name: "College football", short: "College football" },
  { code: "cfl", name: "Canadian Football League", short: "CFL" },
  { code: "nwsl", name: "National Women's Soccer League", short: "NWSL" },
  { code: "afl", name: "American Football League", short: "AFL", closed: true },
  { code: "aafc", name: "All-America Football Conference", short: "AAFC", closed: true },
  { code: "nha", name: "National Hockey Association", short: "NHA", closed: true },
  { code: "pcha", name: "Pacific Coast Hockey Association", short: "PCHA", closed: true },
  { code: "wchl", name: "Western Canada Hockey League", short: "WCHL", closed: true },
  { code: "wha", name: "World Hockey Association", short: "WHA", closed: true },
  { code: "ahl", name: "American Hockey League", short: "AHL" },
  { code: "na", name: "National Association of Professional Base Ball Players", short: "NA", closed: true },
  { code: "aa", name: "American Association", short: "AA", closed: true },
  { code: "ua", name: "Union Association", short: "UA", closed: true },
  { code: "pl", name: "Players' League", short: "PL", closed: true },
  { code: "fl", name: "Federal League", short: "FL", closed: true },
];

/**
 * A league whose seasons also carry teams that are not members of it: college football's FCS opponents (and lower) play FBS teams, and those games
 * count in the FBS teams' records, but the opponents are no teams of the league. The archive files them in a pseudo conference of this name (db/build/230),
 * so every list of the league's teams, its standings and its alignment leaves that conference out, and a page about one of them says what it is.
 */
export const OUTSIDE_CONFERENCE: Partial<Record<LeagueCode, string>> = { ncaaf: "Non-FBS opponents" };

/** True for a conference that is the pseudo conference of a league's outside opponents. */
export const isOutsideConference = (lg: string, conference: string | null | undefined): boolean => !!conference && OUTSIDE_CONFERENCE[lg as LeagueCode] === conference;

/**
 * Leagues whose postseason is a list of games (the bowl games), not series that a bracket joins: they have no series pages, no round pages and no playoff
 * bracket, and a game's page names its bowl instead of a round.
 */
export const NO_SERIES: ReadonlySet<string> = new Set(["ncaaf"]);

/** True for a league whose postseason is told as series (every league but college football). */
export const hasSeries = (lg: string): boolean => !NO_SERIES.has(lg);

/** Leagues with no player data in the archive: no player pages, no players-by-country, no player leaders. Links to those pages are not drawn. */
export const NO_PLAYERS: ReadonlySet<string> = new Set(["ncaaf"]);
export const hasPlayers = (lg: string): boolean => !NO_PLAYERS.has(lg);

/** Leagues with over a hundred teams in a season: the standings race (one line a team) would be unreadable, so it is not drawn. */
export const BIG_FIELD: ReadonlySet<string> = new Set(["ncaaf"]);

/** The league a rival or predecessor league belongs under. One place: the menu, the parent's "Other leagues" section and the trail all read it. */
export const PARENT: Partial<Record<LeagueCode, LeagueCode>> = { afl: "nfl", aafc: "nfl", nha: "nhl", pcha: "nhl", wchl: "nhl", wha: "nhl", na: "mlb", aa: "mlb", ua: "mlb", pl: "mlb", fl: "mlb" };

/**
 * The minor and junior hockey leagues that live on the "More hockey" page (/more-hockey), reached from the NHL page and from one link in the menu: each is a league of its
 * own with no parent (its records are never added to the NHL's), by level. Only leagues the archive holds are here; the next one (the ECHL, the IHL, the CHL's leagues,
 * the USHL, the defunct minors) is one more line. College and women's hockey will be levels of their own.
 */
export const MORE_HOCKEY_LEVEL: Partial<Record<LeagueCode, "minor" | "junior" | "defunct">> = { ahl: "minor" };

/** True for a league listed on the More hockey page. */
export const isMoreHockey = (code: string): boolean => Object.hasOwn(MORE_HOCKEY_LEVEL, code);

/** The leagues of the menu and of every league picker: the ones with no parent that are not on the More hockey page. */
export const LEAGUES = ALL_LEAGUES.filter((l) => !(l.code in PARENT) && !(l.code in MORE_HOCKEY_LEVEL));

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

export const LG: Record<LeagueCode, string> = { nhl: "NHL", pwhl: "PWHL", nba: "NBA", wnba: "WNBA", mlb: "MLB", nfl: "NFL", ncaaf: "College football", cfl: "CFL", nwsl: "NWSL", afl: "AFL", aafc: "AAFC", nha: "NHA", pcha: "PCHA", wchl: "WCHL", wha: "WHA", ahl: "AHL", na: "NA", aa: "AA", ua: "UA", pl: "PL", fl: "FL" };

/**
 * The first NFL season whose last game is a Super Bowl between the league's two conference champions (Super Bowl V, in January 1971). Before that the
 * NFL's last game is its own championship game, 1920-1969 (the one a final was the "NFL Championship"; the AFL played its own: "AFL Championship").
 * The AFL-NFL World Championship Games of 1966-1969 (Super Bowls I-IV) join two leagues, so neither league's season holds them.
 */
export const SUPER_BOWL_SINCE = 1970;

/** The leagues a franchise can have seasons in besides the page's own: a club's page points to its seasons there (the AAFC's Browns, the AFL's Oilers, the Maroons in the NHL, PCHA and WCHL). */
export const RELATED_LEAGUES: Partial<Record<LeagueCode, readonly LeagueCode[]>> = Object.fromEntries(
  ALL_LEAGUES.flatMap((l) => {
    const parent = PARENT[l.code];
    const rel = [...(CHILDREN[l.code] ?? []), ...(parent ? [parent, ...(CHILDREN[parent] ?? []).filter((k) => k !== l.code)] : [])];
    return rel.length ? [[l.code, rel] as const] : [];
  }),
);

export function isLeague(code: string): code is LeagueCode {
  return (LEAGUE_CODES as readonly string[]).includes(code);
}

/** The leagues whose seasons span two calendar years: 1993-94 (the NHL, the NBA and the hockey leagues beside the NHL). The others are one: 2025. */
const TWO_YEAR_SEASONS: ReadonlySet<string> = new Set(["nhl", "pwhl", "nba", "nha", "pcha", "wchl", "wha", "ahl"]);

/** A season as an address segment: 1999-00 for the two-year leagues (the short form, always), 2019 for the others. Addresses never change. */
export function seasonSeg(lg: string, y: number): string {
  return TWO_YEAR_SEASONS.has(lg) ? `${y}-${String(y + 1).slice(2)}` : String(y);
}

/** A season as the reader sees it: 1999-2000 when the second year starts a century (1899-1900, 2099-2100), else the address form (2001-02, 2019). */
export function seasonLabel(lg: string, y: number): string {
  return TWO_YEAR_SEASONS.has(lg) && (y + 1) % 100 === 0 ? `${y}-${y + 1}` : seasonSeg(lg, y);
}

/** The calendar year printed on a championship banner: the year the title was won (spring of a split-year season). */
export function championshipYear(lg: string, y: number): number {
  return TWO_YEAR_SEASONS.has(lg) ? y + 1 : y;
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
