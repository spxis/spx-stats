/**
 * The "Help fill Wikipedia" page: games still marked scheduled long after they began, with the Wikipedia articles a person can edit
 * and the league page to cite. Pure functions; the page (app/[locale]/s/help-wikipedia) and its list (components/WikiGapList.tsx) use them.
 * Nothing here fetches a score or builds one: a visitor reads the official page and edits Wikipedia under their own account.
 */
import type { OfficialLink } from "./officialLinks.ts";
import { PLAYED_WITHIN_DAYS } from "./playedLate.ts";

/** The leagues whose scores we read from English Wikipedia's club-season articles (scripts/daily/run.py LEAGUES). */
export const WIKI_LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;
export type WikiLeague = (typeof WIKI_LEAGUES)[number];

/** Wikipedia's article name where it differs from the club's full name (scripts/daily/run.py TITLE_ALIAS). */
const TITLE_ALIAS: Record<string, string> = { "mlb|Sacramento Athletics": "Athletics" };

const DAY = 86_400_000;

/** The season as Wikipedia writes it in a title: 2026–27 for the NHL and NBA, 2026 for the rest. */
export function seasonLabel(league: string, year: number): string {
  return league === "nhl" || league === "nba" ? `${year}–${String((year + 1) % 100).padStart(2, "0")}` : String(year);
}

const unaccent = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/** The English Wikipedia article of a club's season, the way scripts/daily/run.py names it: "2026–27 Montreal Canadiens season". */
export function seasonTitle(league: string, year: number, club: string): string {
  const name = TITLE_ALIAS[`${league}|${club}`] ?? unaccent(club);
  return `${seasonLabel(league, year)} ${name} season`;
}

/** The MLB postseason article, which holds the playoff games the club articles only summarise. */
export const mlbPostseasonTitle = (year: number) => `${year} Major League Baseball postseason`;

const articlePath = (title: string) => encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/g, ":");

export const wikiViewUrl = (title: string) => `https://en.wikipedia.org/wiki/${articlePath(title)}`;
export const wikiEditUrl = (title: string) => `https://en.wikipedia.org/w/index.php?title=${articlePath(title)}&action=edit`;

/** A game the page can list: the plain facts the browser needs to decide, and to build the links and the citation. */
export interface GapGame {
  id: number;
  league: WikiLeague;
  year: number;
  phase: string;
  date: string;
  startsAt: string | null;
  away: string;
  home: string;
  awayAbbr: string | null;
  homeAbbr: string | null;
  nhlId: number | null;
  nflWeek: number | null;
  /** The two clubs' season articles, then (MLB playoffs) the postseason article. */
  articles: string[];
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The game dates a kept page must carry so that, at any time during the day it is kept, every game in the 14-day rule is in it:
 * from 16 days before the day it is drawn to the day after (a game date is the local date, which can be a day ahead of UTC).
 */
export function candidateWindow(todayUtc: string): { first: string; last: string } {
  return { first: addDays(todayUtc, -(PLAYED_WITHIN_DAYS + 2)), last: addDays(todayUtc, 1) };
}

/** Only these phases are read from the club-season articles. */
export const WIKI_PHASES = ["regular", "playoffs"] as const;

interface RawGame {
  league: string; year: number; game_id: number; game_date: string; phase: string; status: string;
  away: string | null; home: string | null; starts_at?: string | null; nhl_id?: number | null; nfl_week?: number | null;
}

/** A row of the games view as a gap game, or null when it is not one we read from Wikipedia (no club names, another league, another phase, not scheduled). */
export function gapGame(g: RawGame, abbr: (franchise: "away" | "home") => string | null): GapGame | null {
  if (g.status !== "scheduled" || !g.away || !g.home) return null;
  if (!(WIKI_LEAGUES as readonly string[]).includes(g.league) || !(WIKI_PHASES as readonly string[]).includes(g.phase)) return null;
  const league = g.league as WikiLeague;
  const articles = [seasonTitle(league, g.year, g.away), seasonTitle(league, g.year, g.home)];
  if (league === "mlb" && g.phase === "playoffs") articles.push(mlbPostseasonTitle(g.year));
  return {
    id: g.game_id, league, year: g.year, phase: g.phase, date: g.game_date, startsAt: g.starts_at ?? null,
    away: g.away, home: g.home, awayAbbr: abbr("away"), homeAbbr: abbr("home"),
    nhlId: g.nhl_id ?? null, nflWeek: g.nfl_week ?? null, articles,
  };
}

/** The league page a person reads the result on, and the name to give it as publisher. Null for an address the page does not know. */
export function publisherOf(href: string): string | null {
  let host: string;
  try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { return null; }
  const known: Record<string, string> = {
    "nhl.com": "NHL.com", "nba.com": "NBA.com", "mlb.com": "MLB.com", "nfl.com": "NFL.com", "cfl.ca": "CFL.ca", "retrosheet.org": "Retrosheet",
  };
  return known[host] ?? null;
}

/**
 * The one official page to read and cite for a game: the game's own page when the links hold one, else that day's scores.
 * The notes PDF is never the page to cite.
 */
export function pageToCite(links: readonly OfficialLink[]): OfficialLink | null {
  return links.find((l) => l.kind === "box") ?? links.find((l) => l.kind === "day") ?? null;
}

/** A value for a template parameter: no pipe or braces, which would end the parameter or the template. */
const param = (s: string) => s.replace(/[|{}]/g, "-").replace(/\s+/g, " ").trim();

/**
 * A ready {{cite web}} for the official page. The title is a plain description of the page, to be checked against what the page says;
 * the publisher comes from the address; access-date is the day of the visit (YYYY-MM-DD). The score is never in it.
 */
export function citeTemplate(p: { url: string; title: string; publisher: string; accessDate: string }): string {
  return `{{cite web |url=${p.url} |title=${param(p.title)} |publisher=${param(p.publisher)} |access-date=${param(p.accessDate)}}}`;
}

/** The citation for a game, from the links the page builds in the browser. Null when no official page is known for the league. */
export function gameCitation(game: Pick<GapGame, "league" | "date" | "away" | "home">, links: readonly OfficialLink[], accessDate: string): { url: string; template: string } | null {
  const link = pageToCite(links);
  if (!link) return null;
  const publisher = publisherOf(link.href);
  if (!publisher) return null;
  const title = link.kind === "box" ? `${game.away} at ${game.home}, ${game.date}` : `${game.league.toUpperCase()} scores, ${game.date}`;
  return { url: link.href, template: citeTemplate({ url: link.href, title, publisher, accessDate }) };
}

/** Today's date in the browser's own calendar, YYYY-MM-DD (for access-date). */
export function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Group games by league (in WIKI_LEAGUES order), newest date first inside each. */
export function groupByLeague<T extends { league: WikiLeague; date: string; id: number }>(games: readonly T[]): { league: WikiLeague; games: T[] }[] {
  return WIKI_LEAGUES
    .map((league) => ({ league, games: games.filter((g) => g.league === league).sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? 1 : -1)) }))
    .filter((s) => s.games.length > 0);
}
