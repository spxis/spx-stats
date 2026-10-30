/**
 * The league world page's by-team table as short lines, not drawn cells (the same arrangement as lib/countryLines.ts): one line a club with the numbers its
 * columns show, the logo addresses written once in a list the lines point into. Pure, so a node script can test it.
 */
import type { Count } from "./countryModel.ts";

/** Club, name, index into `logos` (-1 when it has none), players, those with a known country, countries, then the top country and its players, the second and its players ("" and 0 when none). */
export type TeamLine = [number, string, number, number, number, number, string, number, string, number];
export interface TeamsWire { logos: string[]; lines: TeamLine[] }

export interface TeamTally { f: number; name: string; t: { list: Count[]; known: number; total: number } }

/** Most players first, the table's default order, so the first lines are the table's first rows. */
export function buildTeamsWire(teams: TeamTally[], logoOf: (f: number) => string | null): TeamsWire {
  const logos: string[] = [];
  const lines = teams.map((x, i) => {
    const url = logoOf(x.f);
    let lo = -1;
    if (url) { lo = logos.indexOf(url); if (lo < 0) lo = logos.push(url) - 1; }
    const [a, b] = x.t.list;
    const line: TeamLine = [x.f, x.name, lo, x.t.total, x.t.known, x.t.list.length, a?.code ?? "", a?.n ?? 0, b?.code ?? "", b?.n ?? 0];
    return { line, i };
  });
  lines.sort((p, q) => q.line[3] - p.line[3] || p.i - q.i);
  return { logos, lines: lines.map((l) => l.line) };
}

export interface TeamRow { f: number; name: string; logo: string | null; total: number; known: number; countries: number; top: Count | null; second: Count | null }

export function readTeams(wire: TeamsWire): TeamRow[] {
  return wire.lines.map(([f, name, lo, total, known, countries, c1, n1, c2, n2]) => ({
    f, name, logo: lo >= 0 ? wire.logos[lo] : null, total, known, countries,
    top: c1 ? { code: c1, n: n1 } : null, second: c2 ? { code: c2, n: n2 } : null,
  }));
}
