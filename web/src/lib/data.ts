import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import { standingRows, teamSeasonRows } from "./api/teamSeasons";
import {
  awardSchema, awardSourceSchema, franchiseNameSchema, gameSchema, gamesBySourceSchema, qualitySchema,
  seasonNoteSchema, seasonSummarySchema, sourceSchema, standingSchema, teamAbbrSchema, teamBrandSchema, teamSeasonSchema, totalsSchema,
} from "./api/schemas";
import type { AwardRow, GameRow, SeasonNoteRow, SeasonSummaryRow, StandingRow, TotalsRow } from "./api/types";
import { tursoConfigured, tursoQuality, tursoTotals } from "./turso/aggregates";
import { QUALITY_ISSUES_SHOWN } from "./turso/qualitySql";
import { groupAbbrs, type AbbrMap } from "./abbr";
import { groupBrands, type BrandMap } from "./brand";
import { mergeSpans } from "./nameEras";
import { edgeSteps, playedYears, seasonSteps, windowSteps } from "./gameSeasons";
import { isOutsideConference, isSpx } from "./leagues";
import { getAllMembers, isMemberRow } from "./leagueMembers";
import { logoFitSchema, type LogoFit } from "./logoFit";
import { seasonOpen, withIdleTeams } from "./idleTeams";
import type { ClubTeam, GameTuple, Phase } from "./season";

/* ---------- home, leagues -------------------------------------------------------------- */

export const getSummary = cache(async (): Promise<{ seasons: SeasonSummaryRow[]; totals: TotalsRow }> => {
  const [seasons, totals] = await Promise.all([
    rows("season_summary", "select=*&order=league,year", seasonSummarySchema),
    rows("totals", "select=*", totalsSchema),
  ]);
  if (!totals[0]) throw new ApiError("totals: no row");
  const own = tursoConfigured() ? await tursoTotals() : null;
  return { seasons: await withUpcomingClubs(seasons), totals: own ? { ...totals[0], ...own } : totals[0] };
});

/**
 * The summary counts a season's clubs from its games, so a season that has its team seasons but no games yet reads as 0 clubs,
 * the same as a season the league sat out. For the seasons after each league's last played one, count the clubs from the team
 * seasons instead. A failed read leaves them as they were.
 */
async function withUpcomingClubs(seasons: SeasonSummaryRow[]): Promise<SeasonSummaryRow[]> {
  const lastPlayed = new Map<string, number>();
  for (const s of seasons) if (s.games > 0) lastPlayed.set(s.league, Math.max(lastPlayed.get(s.league) ?? -Infinity, s.year));
  const later = seasons.filter((s) => s.games === 0 && !s.champion && s.year > (lastPlayed.get(s.league) ?? Infinity));
  if (!later.length) return seasons;
  const from = Math.min(...later.map((s) => s.year));
  const clubs = await teamSeasonRows(`year=gte.${from}&select=league,year,franchise_id`, z.object({ league: z.string(), year: z.number(), franchise_id: z.number() })).catch(() => []);
  const count = new Map<string, number>();
  for (const c of clubs) count.set(`${c.league}|${c.year}`, (count.get(`${c.league}|${c.year}`) ?? 0) + 1);
  return seasons.map((s) => (later.includes(s) ? { ...s, teams: count.get(`${s.league}|${s.year}`) ?? 0 } : s));
}

/** Every brand era of every franchise. A missing or empty view just means no logos or colours yet. */
/** A league's team abbreviations, era by era (the database's own: core.franchise_identity.abbreviation). */
export const getAbbrs = cache(async (lg: string): Promise<AbbrMap> => {
  const all = await rows("team_abbr", `league=eq.${lg}&select=*&order=franchise_id,valid_from.nullsfirst`, teamAbbrSchema).catch(() => []);
  return groupAbbrs(all);
});

export const getBrands = cache(async (): Promise<BrandMap> => {
  const all = await rows("team_brand", "select=*&order=franchise_id,brand_from.nullsfirst", teamBrandSchema).catch(() => []);
  return groupBrands(all);
});

/** How each logo is fitted into the site's logo boxes (api.logo_fit, migration 107); none while the view or its rows are missing. */
export const getLogoFits = cache(async (): Promise<LogoFit[]> =>
  rows("logo_fit", "select=*&order=logo_file", logoFitSchema).catch(() => []));

/* ---------- a season ------------------------------------------------------------------- */

const PHASE: Record<string, Phase> = { regular: "r", playoffs: "p", preseason: "s", all_star: "a" };

export interface SeasonData {
  league: string;
  year: number;
  label: string;
  teams: ClubTeam[];
  standings: StandingRow[];
  awards: AwardRow[];
  games: GameTuple[];
}

const clubSchema = z.object({
  league: z.string(), year: z.number(), franchise_id: z.number(), team: z.string().nullable(),
  conference: z.string().nullish(), conference_short: z.string().nullish(), division: z.string().nullish(), division_short: z.string().nullish(),
});

/**
 * Every team of a season that has no champion yet (one under way or still to start), from its team seasons. The standings views
 * list only clubs with a final game, so these are what puts a club that has not played on the table at 0-0. A finished season is
 * left alone: its team seasons without games are gaps in the old data, not clubs waiting to play.
 */
const getSeasonClubs = cache(async (lg: string, y: number) =>
  teamSeasonRows(`league=eq.${lg}&year=eq.${y}&select=*`, clubSchema).catch(() => []));

const seasonGameReads = cache(() => new Map<string, Promise<GameRow[]>>());

/** Every game of a season, in the order played: one read, kept for the page being drawn so the playoff games can be taken from it (`seasonGamesAsked`). */
const getSeasonGameRows = (lg: string, y: number): Promise<GameRow[]> => {
  const asked = seasonGameReads();
  const key = `${lg}|${y}`;
  const had = asked.get(key);
  if (had) return had;
  const read = rows("games", `league=eq.${lg}&year=eq.${y}&select=*&order=game_date,game_id`, gameSchema);
  asked.set(key, read);
  return read;
};

/** The season's games if this page has already asked for them (the season page does), else undefined. */
export const seasonGamesAsked = (lg: string, y: number): Promise<GameRow[]> | undefined => seasonGameReads().get(`${lg}|${y}`);

export const getSeason = cache(async (lg: string, y: number): Promise<SeasonData | null> => {
  const q = `league=eq.${lg}&year=eq.${y}`;
  // The season's summary row comes from the whole list every page already reads (kept a day, shared), not from a read of its own.
  const [all, games, standingsPlayed, awards] = await Promise.all([
    getSummary(),
    getSeasonGameRows(lg, y),
    standingRows(`${q}&select=*`, standingSchema),
    rows("awards", `${q}&select=*`, awardSchema),
  ]);
  const summary = all.seasons.filter((s) => s.league === lg && s.year === y);
  if (!summary[0]) return null;
  // The clubs that have not played are looked for only in a season still open.
  const idle = !summary[0].champion && seasonOpen(games);
  const standings = (idle ? withIdleTeams(standingsPlayed, await getSeasonClubs(lg, y)) : standingsPlayed).filter((s) => !isOutsideConference(lg, s.conference));
  const teams = new Map<number, ClubTeam>();
  for (const g of games) {
    teams.set(g.home_id, { id: g.home_id, f: g.home_f, name: g.home });
    teams.set(g.away_id, { id: g.away_id, f: g.away_f, name: g.away });
  }
  for (const s of standings) teams.set(s.team_id, { id: s.team_id, f: s.franchise_id, name: s.team });
  return {
    league: lg,
    year: y,
    label: summary[0].label,
    teams: [...teams.values()].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    standings: standings.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0)),
    awards: awards.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)),
    games: games.map((g): GameTuple => [
      g.game_date, g.away_id, g.away_score, g.home_score, g.home_id, PHASE[g.phase] || "r", g.status[0] ?? "", g.source,
      g.overtime ? 1 : 0, g.checked, g.game_id,
    ]),
  };
});

/** Every team of a league's season with the franchise it belongs to, for the map of that season. */
export const getClubs = cache(async (lg: string, y: number) => {
  const st = (await standingRows(`league=eq.${lg}&year=eq.${y}&select=*`, standingSchema)).filter((s) => !isOutsideConference(lg, s.conference));
  return st.map((s) => ({ franchise_id: s.franchise_id, team: s.team }));
});

/** Every standings row of a league's season (the same request as getClubs, so one cached fetch). */
export const getSeasonStandings = cache(async (lg: string, y: number): Promise<StandingRow[]> =>
  (await standingRows(`league=eq.${lg}&year=eq.${y}&select=*`, standingSchema)).filter((s) => !isOutsideConference(lg, s.conference)));

/** The database's notes on a league's season (why it was short, and so on). A missing view or a failed fetch just means no notes. */
export const getSeasonNotes = cache(async (lg: string, y: number): Promise<SeasonNoteRow[]> =>
  rows("season_note", `league=eq.${lg}&year=eq.${y}&select=*`, seasonNoteSchema).catch(() => []));

/* ---------- a team --------------------------------------------------------------------- */

export interface TeamData {
  f: number;
  names: { name: string; from: string | null; to: string | null }[];
  /** [year, w, l, t, otl] for each season with a record. */
  seasons: [number, number, number | null, number | null, number | null][];
  titles: number[];
  /** The seasons the club has in the archive but no regular-season record for (a Stanley Cup Final or a playoff run is all there is, or the season has not begun): [year, champion]. */
  unrecorded: [number, boolean, string | null][];
}

/**
 * A franchise's team seasons in every league it played in, in one read: a club of a rival league is the same franchise as the one that played on (the Braves in the
 * National Association and MLB), and the team page asks for each league of its family, so one read serves them all (each then keeps the rows of its own league).
 */
const getFranchiseTeamSeasons = cache(async (f: number) => teamSeasonRows(`franchise_id=eq.${f}&select=*&order=year`, teamSeasonSchema));

/** The same for a franchise's standings rows, newest first. */
const getFranchiseStandings = cache(async (f: number): Promise<StandingRow[]> => standingRows(`franchise_id=eq.${f}&select=*&order=year.desc`, standingSchema));

export const getTeam = cache(async (lg: string, f: number): Promise<TeamData | null> => {
  // Every name the franchise wore in any league, so a club of a rival league (the PCHA's Millionaires, the NHL's Maroons) lists them all.
  const [all, names] = await Promise.all([
    getFranchiseTeamSeasons(f),
    rows("franchise_names", `franchise_id=eq.${f}&select=*&order=name_from`, franchiseNameSchema),
  ]);
  const ts = all.filter((s) => s.league === lg);
  if (!ts.length && !names.some((n) => n.league === lg)) return null;
  const t: TeamData = { f, names: mergeSpans(names.map((n) => ({ name: n.name, from: n.name_from, to: n.name_to }))), seasons: [], titles: [], unrecorded: [] };
  let last: string | null = null;
  for (const s of ts) {
    if (s.w != null) t.seasons.push([s.year, s.w, s.l, s.t, s.otl]);
    else t.unrecorded.push([s.year, s.champion, s.team]);
    if (s.champion) t.titles.push(s.year);
    if (!t.names.length) last = s.team;
  }
  if (!t.names.length && last) t.names.push({ name: last, from: null, to: null });
  return t;
});

const phaseRow = z.object({ year: z.number(), phase: z.string() });

/** The phases a club played games in, for the given seasons (a comma list): year to the set of phases ("regular", "playoffs", ...). One small read, for the few seasons that have no standings row. */
export const getTeamPhases = cache(async (lg: string, f: number, years: string): Promise<Map<number, Set<string>>> => {
  const out = new Map<number, Set<string>>();
  if (!years) return out;
  for (const r of await rows("games", `league=eq.${lg}&year=in.(${years})&or=(away_f.eq.${f},home_f.eq.${f})&select=year,phase`, phaseRow)) {
    out.set(r.year, (out.get(r.year) ?? new Set()).add(r.phase));
  }
  return out;
});

export const getTeamStandings = cache(async (lg: string, f: number): Promise<StandingRow[]> =>
  (await getFranchiseStandings(f)).filter((s) => s.league === lg));

/**
 * Every game a franchise played in a season, in the order asked for: `game_date.asc|desc` (then the game id the same way).
 * The order is built from two fixed words, never from the request, so nothing else reaches the API.
 */
export const getTeamGames = cache(async (lg: string, y: number, f: number, dir: "asc" | "desc" = "asc"): Promise<GameRow[]> =>
  rows("games", `league=eq.${lg}&year=eq.${y}&or=(away_f.eq.${f},home_f.eq.${f})&select=*&order=game_date.${dir},game_id.${dir}`, gameSchema));

/* ---------- scores by date ------------------------------------------------------------- */

const gameDaySchema = z.object({ game_date: z.string(), year: z.number() });
type GameDay = z.infer<typeof gameDaySchema>;
const seasonCountsSchema = z.object({ year: z.number(), games: z.number(), finals: z.number(), playoff_finals: z.number() });

/**
 * The start years of a league's seasons that have games, one small cached read. Every read of `games` that is not already
 * inside one season carries a `year=eq.` taken from here: without it the view scans every game of every league (it reaches
 * its league only through a join to the season) and a cold read outlasts the database's 8 s limit.
 */
const getLeagueYears = cache(async (lg: string): Promise<number[]> =>
  playedYears(await rows("season_summary", `league=eq.${lg}&select=year,games,finals,playoff_finals&order=year`, seasonCountsSchema)));

/** Every game of a league between two days (both included), for the scoreboard and the days around it. */
export const getGamesBetween = cache(async (lg: string, first: string, last: string): Promise<GameRow[]> => {
  const years = windowSteps(await getLeagueYears(lg), first, last);
  const parts = await Promise.all(years.map((y) => rows("games", `league=eq.${lg}&year=eq.${y}&game_date=gte.${first}&game_date=lte.${last}&select=*&order=game_date,game_id`, gameSchema)));
  return parts.flat().sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id));
});

/** The first row of these seasons (tried in the order given) that has a game matching `filter`, read in `order`. */
async function firstGameDay(lg: string, steps: number[], filter: string, order: string): Promise<GameDay | null> {
  for (const y of steps) {
    const [r] = await rows("games", `league=eq.${lg}&year=eq.${y}${filter}&select=game_date,year&order=${order}&limit=1`, gameDaySchema);
    if (r) return r;
  }
  return null;
}

/** The league's game day nearest a day on one side of it (strictly before or after), or null. */
export const getGameDay = cache(async (lg: string, day: string, side: "before" | "after"): Promise<GameDay | null> =>
  firstGameDay(lg, seasonSteps(await getLeagueYears(lg), day, side), `&game_date=${side === "before" ? "lt" : "gt"}.${day}`, `game_date.${side === "before" ? "desc" : "asc"}`));

/** A league's first and last game day. */
export const getGameBounds = cache(async (lg: string): Promise<{ first: GameDay; last: GameDay } | null> => {
  const years = await getLeagueYears(lg);
  const [first, last] = await Promise.all([
    firstGameDay(lg, edgeSteps(years, "first"), "", "game_date.asc"),
    firstGameDay(lg, edgeSteps(years, "last"), "", "game_date.desc"),
  ]);
  return first && last ? { first, last } : null;
});

/** The last game day of a league's season, or null when it has no games. */
export const getSeasonLastDay = cache(async (lg: string, y: number): Promise<string | null> =>
  (await rows("games", `league=eq.${lg}&year=eq.${y}&select=game_date,year&order=game_date.desc&limit=1`, gameDaySchema))[0]?.game_date ?? null);

/** Every day a league's season has a game, ascending (the date picker puts a dot on each). */
export const getSeasonDays = cache(async (lg: string, y: number): Promise<string[]> => {
  const all = await rows("games", `league=eq.${lg}&year=eq.${y}&select=game_date,year&order=game_date`, gameDaySchema);
  return [...new Set(all.map((g) => g.game_date))];
});

/** Every (league, year, franchise) with a record, for the sitemap's team-season pages. */
export const getTeamSeasonIndex = cache(async () => {
  const [all, members] = await Promise.all([teamSeasonRows("select=league,year,franchise_id,w&order=league,year,franchise_id", z.object({ league: z.string(), year: z.number(), franchise_id: z.number(), w: z.number().nullable() })), getAllMembers()]);
  return all.filter((t) => isMemberRow(members, t.league, t.franchise_id));
});

/** Every (league, franchise) with a page, for the sitemap (franchise_names is far cheaper to page than team_seasons). */
export const getTeamIndex = cache(async (): Promise<{ league: string; franchise_id: number }[]> => {
  const [all, members] = await Promise.all([rows("franchise_names", "select=league,franchise_id&order=league,franchise_id", z.object({ league: z.string(), franchise_id: z.number() })), getAllMembers()]);
  const seen = new Set<string>();
  return all.filter((t) => { const k = `${t.league}|${t.franchise_id}`; return seen.has(k) || !isMemberRow(members, t.league, t.franchise_id) ? false : (seen.add(k), true); });
});

/* ---------- sources, quality ----------------------------------------------------------- */

/** SPX's own databases, scraper store and published files are one source: SPX. */
const one = (c: string): string => (isSpx(c) ? "spx" : c);
const SPX_SOURCE = {
  name: "SPX (SportsInteractive.com)", licence: "Owned by SPX", attribution: "SPX (SportsInteractive.com), 1997–2013",
  url: null, notes: "SPX's own databases, scraper store and published files.",
};

export const getSources = cache(async () => {
  const [src, by, aw] = await Promise.all([
    rows("sources", "select=*", sourceSchema),
    rows("games_by_source", "select=*", gamesBySourceSchema),
    rows("awards", "select=source", awardSourceSchema),
  ]);
  const games = (c: string) => by.filter((b) => one(b.source) === c).reduce((a, b) => a + b.games, 0);
  const winners = (c: string) => aw.filter((w) => one(w.source) === c).length;
  const list = src.filter((s) => one(s.code) !== "spx");
  list.unshift({ ...SPX_SOURCE, code: "spx" });
  return list.map((s) => ({ ...s, games: games(s.code), award_winners: winners(s.code) }));
});

function sum<T extends { n: number }>(list: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of list) {
    const k = key(x);
    const had = m.get(k);
    m.set(k, had ? { ...had, n: had.n + x.n } : x);
  }
  return [...m.values()];
}

export const getQuality = cache(async () => {
  const [q, by] = await Promise.all([
    tursoConfigured() ? tursoQuality() : rows("quality", "select=*&order=n.desc", qualitySchema),
    rows("games_by_source", "select=*&order=league,games.desc", gamesBySourceSchema),
  ]);
  const checks = sum(
    q.filter((x) => x.kind === "check").map((x) => ({ source: one(x.source), kind: x.entity, status: x.what, n: x.n })),
    (x) => [x.source, x.kind, x.status].join("|"),
  );
  const issues = sum(
    q.filter((x) => x.kind === "issue").map((x) => ({
      source: one(x.source), kind: x.entity, issue: x.what, resolution: (x.resolution || "").replace(/\d+/g, "#"), n: x.n,
    })),
    (x) => [x.source, x.kind, x.issue, x.resolution].join("|"),
  );
  const games = sum(by.map((b) => ({ league: b.league, source: one(b.source), n: b.games })), (x) => `${x.league}|${x.source}`);
  const desc = (a: { n: number }, b: { n: number }) => b.n - a.n;
  return {
    checks: checks.sort(desc),
    issues: issues.sort(desc).slice(0, QUALITY_ISSUES_SHOWN),
    games_by_source: games.sort((a, b) => a.league.localeCompare(b.league) || b.n - a.n),
  };
});
