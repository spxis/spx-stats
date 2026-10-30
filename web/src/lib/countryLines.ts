/**
 * The country pages' tables as short lines of plain data, not drawn cells: a table of hundreds of rows used to travel twice (as markup and as the
 * elements the page sent to the browser, 360 KB for /countries). The page draws its first rows from these lines and the browser builds the others
 * when "Show all" is pressed, so the rest is only data. Pure, so a node script can test it.
 */
import { share, isKnown, versus, type LeagueCount } from "./countryModel.ts";

export const COUNTRIES_HEAD = 12;

export const countriesVersusPath = "/countries/versus";
export const countriesFirstsPath = "/countries/firsts";
export const countriesTrendPath = "/countries/rows/trend";

/* ---------- league against league ---------- */

/** One line a country: its code, then its players in each of `leagues` (0 where it has none). The order is the table's: most players first. */
export interface VersusWire { leagues: string[]; known: number[]; lines: (string | number)[][] }

export function buildVersusWire(rows: LeagueCount[], leagues: string[]): VersusWire {
  const known = leagues.map((l) => rows.find((r) => r.league === l)?.league_known ?? 0);
  return { leagues, known, lines: versus(rows).map((v) => [v.code, ...leagues.map((l) => v.byLeague[l]?.n ?? 0)]) };
}

export interface VersusRow { code: string; total: number; byLeague: Record<string, { n: number; share: number }> }

export function readVersus(wire: VersusWire): VersusRow[] {
  return wire.lines.map((line) => {
    const byLeague: VersusRow["byLeague"] = {};
    let total = 0;
    wire.leagues.forEach((l, i) => {
      const n = Number(line[i + 1]);
      if (n > 0) { byLeague[l] = { n, share: share(n, wire.known[i]) }; total += n; }
    });
    return { code: String(line[0]), total, byLeague };
  });
}

/* ---------- firsts ---------- */

/**
 * One line a country and league: country index, league index, first season, players, the first player's id (0 when none), his name ("" when none), and
 * his address only where it is not the plain one for the league (a person filed under another league). Oldest first, the order of the table.
 */
export type FirstLine = [number, number, number, number, number, string, string?];
export interface FirstsWire { countries: string[]; leagues: string[]; lines: FirstLine[] }

export interface FirstRow { code: string; league: string; year: number; players: number; id: number; name: string; href: string | null }

/** The address of a player's page: `player` is the site's (it knows the person filed under another league), `plain` the one a league's own player gets (lib/playerPath.ts). */
type PlayerHref = (id: number, name: string, league: string) => string;

export function buildFirstsWire(rows: LeagueCount[], player: PlayerHref, plain: PlayerHref): FirstsWire {
  const firsts = rows.filter((r) => isKnown(r.country));
  const countries = [...new Set(firsts.map((r) => r.country))];
  const leagues = [...new Set(firsts.map((r) => r.league))];
  const lines = firsts.map((r, i) => {
    const has = r.first_person_id != null && !!r.first_name;
    const line: FirstLine = [countries.indexOf(r.country), leagues.indexOf(r.league), r.first_year, r.players, has ? r.first_person_id! : 0, has ? r.first_name! : (r.first_name ?? "")];
    if (has) { const href = player(r.first_person_id!, r.first_name!, r.league); if (href !== plain(r.first_person_id!, r.first_name!, r.league)) line.push(href); }
    return { line, i };
  });
  // The table's default order, the oldest first, ties as the database listed them, so the first rows of the lines are the first rows of the table.
  lines.sort((a, b) => a.line[2] - b.line[2] || a.i - b.i);
  return { countries, leagues, lines: lines.map((l) => l.line) };
}

export function readFirsts(wire: FirstsWire, plain: PlayerHref): FirstRow[] {
  return wire.lines.map(([c, l, year, players, id, name, href]) => {
    const league = wire.leagues[l];
    return { code: wire.countries[c], league, year, players, id, name, href: id && name ? href ?? plain(id, name, league) : null };
  });
}

/* ---------- the mix bars ---------- */

/** One league's bar: its players, those whose country is known, how many countries, and the players of each of the page's biggest countries. */
export interface MixBar { league: string; all: number; known: number; countries: number; ns: number[] }
