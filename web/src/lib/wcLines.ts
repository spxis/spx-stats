/**
 * A tournament's long tables as short lines of plain data, not drawn cells: a World Cup page held a table of teams, of matches and of top scorers whose rows travelled twice
 * (as markup and as the elements the page sent to the browser, 56 KB of the 2026 page's payload). The page draws its first rows from these lines and the browser builds
 * the others when "Show all" is pressed, so the rest is only data; /worldcup/<year>/tables has every row in markup for a reader without script. Pure, so a node script can test it.
 */
import { reachRank } from "./soccerView.ts";

export const WC_HEAD = 20;

export const wcTablesPath = (year: number): string => `/worldcup/${year}/tables`;

/** The fields of a team of the tournament the table reads. */
export interface WcTeamInput {
  team_slug: string; team: string; flag_code: string | null; group_name: string | null; performance: string | null; final_position: number | null;
  played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; managers: string[] | null;
}

/** [slug, name, flag, group, performance, final position (0 none), played, won, drawn, lost, goals for, goals against, managers joined]. */
export type WcTeamLine = [slug: string, name: string, flag: string | null, group: string, performance: string, place: number, p: number, w: number, d: number, l: number, gf: number, ga: number, managers: string];

/** In the table's own first order (how far the team went, the furthest first), so the head the page draws is the first rows of what a reader sees. */
export const buildWcTeams = (teams: readonly WcTeamInput[]): WcTeamLine[] => [...teams].sort((a, b) => reachRank(b) - reachRank(a)).map((t) => [
  t.team_slug, t.team, t.flag_code, t.group_name ?? "", t.performance ?? "", t.final_position ?? 0, t.played, t.won, t.drawn, t.lost, t.goals_for, t.goals_against, t.managers?.join(", ") ?? "",
]);

export interface WcMatchInput {
  match_id: number; match_date: string; stage_key: string; stage_order: number; group_name: string | null;
  home: string; home_slug: string; home_flag: string | null; home_goals: number; away: string; away_slug: string; away_flag: string | null; away_goals: number;
  extra_time: boolean; shootout: boolean; home_penalties: number | null; away_penalties: number | null;
  venue_name: string | null; venue_city: string | null; venue_wikidata_id: string | null; venue_id: number | null;
}

/**
 * The matches: `c` the clubs that appear ([slug, name, flag]), `v` the grounds ([name, Wikidata id or "", city or "", linked 0|1]), `s` the stages ([key, group or "", order]), and one
 * line a match, in the order of the data: [match id, date, stage, home team, home goals, away team, away goals, ground (-1 none), note, penalties home, penalties away].
 * The note is 0 none, 1 after extra time, 2 on penalties (the last two figures).
 */
export interface WcMatchesWire { c: [string, string, string | null][]; v: [string, string, string, number][]; s: [string, string, number][]; lines: (string | number)[][] }

/** The matches in the table's own first order (by date), so the head the page draws is the first rows of what a reader sees. */
export function buildWcMatches(unsorted: readonly WcMatchInput[]): WcMatchesWire {
  const matches = [...unsorted].sort((a, b) => (a.match_date < b.match_date ? -1 : a.match_date > b.match_date ? 1 : 0));
  const c: WcMatchesWire["c"] = []; const cAt = new Map<string, number>();
  const v: WcMatchesWire["v"] = []; const vAt = new Map<string, number>();
  const s: WcMatchesWire["s"] = []; const sAt = new Map<string, number>();
  const club = (slug: string, name: string, flag: string | null) => { const k = `${slug}\n${name}\n${flag ?? ""}`; let i = cAt.get(k); if (i == null) { i = c.length; c.push([slug, name, flag]); cAt.set(k, i); } return i; };
  const ground = (m: WcMatchInput) => {
    if (!m.venue_name && !m.venue_city) return -1;
    const row: WcMatchesWire["v"][number] = [m.venue_name ?? "", m.venue_wikidata_id ?? "", m.venue_city ?? "", m.venue_id != null ? 1 : 0];
    const k = row.join("\n"); let i = vAt.get(k); if (i == null) { i = v.length; v.push(row); vAt.set(k, i); } return i;
  };
  const stage = (m: WcMatchInput) => { const k = `${m.stage_key}\n${m.group_name ?? ""}`; let i = sAt.get(k); if (i == null) { i = s.length; s.push([m.stage_key, m.group_name ?? "", m.stage_order]); sAt.set(k, i); } return i; };
  const lines = matches.map((m) => {
    let note = 0; let hp = 0; let ap = 0;
    if (m.shootout && m.home_penalties != null && m.away_penalties != null) { note = 2; hp = m.home_penalties; ap = m.away_penalties; }
    else if (m.extra_time) note = 1;
    const line: (string | number)[] = [m.match_id, m.match_date, stage(m), club(m.home_slug, m.home, m.home_flag), m.home_goals, club(m.away_slug, m.away, m.away_flag), m.away_goals, ground(m), note];
    if (note === 2) line.push(hp, ap);
    return line;
  });
  return { c, v, s, lines };
}

export interface WcMatchRow {
  id: number; date: string; stageKey: string; group: string; stageOrder: number; home: string; homeSlug: string; homeFlag: string | null; hg: number; away: string; awaySlug: string; awayFlag: string | null; ag: number;
  venue: string | null; venueQid: string | null; venueCity: string | null; venueLinked: boolean; note: number; hp: number; ap: number;
}

export function readWcMatches(wire: WcMatchesWire): WcMatchRow[] {
  return wire.lines.map((l) => {
    const [homeSlug, home, homeFlag] = wire.c[Number(l[3])]; const [awaySlug, away, awayFlag] = wire.c[Number(l[5])];
    const g = wire.v[Number(l[7])]; const st = wire.s[Number(l[2])];
    return {
      id: Number(l[0]), date: String(l[1]), stageKey: st[0], group: st[1], stageOrder: st[2], home, homeSlug, homeFlag, hg: Number(l[4]), away, awaySlug, awayFlag, ag: Number(l[6]),
      venue: g && g[0] ? g[0] : null, venueQid: g && g[1] ? g[1] : null, venueCity: g && g[2] ? g[2] : null, venueLinked: g ? g[3] === 1 : false,
      note: Number(l[8]), hp: Number(l[9] ?? 0), ap: Number(l[10] ?? 0),
    };
  });
}

export interface WcScorerInput { person_id: number | null; player: string; team_id: string; team: string; team_slug: string; flag_code: string | null; goals: number; penalties: number; matches_scored_in: number }

/** [person id (0 none), player, team slug, team name, flag, goals, penalties, matches scored in]. */
export type WcScorerLine = [id: number, player: string, slug: string, team: string, flag: string | null, goals: number, pens: number, games: number];

/** The scorers by goals, the most first (the table's own first order; the data's order breaks ties). */
export const buildWcScorers = (scorers: readonly WcScorerInput[]): WcScorerLine[] => [...scorers].sort((a, b) => b.goals - a.goals).map((s) => [s.person_id ?? 0, s.player, s.team_slug, s.team, s.flag_code, s.goals, s.penalties, s.matches_scored_in]);
