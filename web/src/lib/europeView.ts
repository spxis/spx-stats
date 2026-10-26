/**
 * What a European league-season page works out from its matches (pure, no server code; scripts/europe.test.ts):
 *   tableFromMatches  the league table from the regular-season results, for a season whose source gave no table. Points per win by country and year
 *                     (3 from 1981-82 in England, 1994-95 in Italy and France, 1995-96 in Spain and Germany, 2 before); ties by goal difference then goals
 *                     for. It knows no points deduction and no head-to-head rule, so a page says the table is worked out, not read from a source.
 *   crossTable        the results as a grid: the home club on the row, the away club on the column.
 */
export interface EuropeMatch {
  home_team_id: string; away_team_id: string; home_goals: number; away_goals: number; stage_key: string;
}

export interface TableRow {
  team_id: string; played: number; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; goal_difference: number; points: number;
}

/** The first season (its start year) of three points for a win, by country pyramid. */
const THREE_POINTS_FROM: Record<string, number> = { england: 1981, italy: 1994, france: 1994, spain: 1995, germany: 1995 };

export const winPoints = (system: string, year: number): number => (year >= (THREE_POINTS_FROM[system] ?? 1995) ? 3 : 2);

export function tableFromMatches(matches: readonly EuropeMatch[], system: string, year: number): TableRow[] {
  const pw = winPoints(system, year);
  const by = new Map<string, TableRow>();
  const row = (id: string): TableRow => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { team_id: id, played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 }));
    return r;
  };
  for (const m of matches) {
    if (m.stage_key !== "regular") continue;
    const h = row(m.home_team_id), a = row(m.away_team_id);
    h.played++; a.played++;
    h.goals_for += m.home_goals; h.goals_against += m.away_goals;
    a.goals_for += m.away_goals; a.goals_against += m.home_goals;
    if (m.home_goals > m.away_goals) { h.wins++; a.losses++; h.points += pw; }
    else if (m.home_goals < m.away_goals) { a.wins++; h.losses++; a.points += pw; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }
  const out = [...by.values()];
  for (const r of out) r.goal_difference = r.goals_for - r.goals_against;
  return out.sort((x, y) => y.points - x.points || y.goal_difference - x.goal_difference || y.goals_for - x.goals_for || x.team_id.localeCompare(y.team_id));
}

/** The regular-season score of `home` at home to `away`, or null when the grid holds none. */
export function crossTable(matches: readonly EuropeMatch[]): (home: string, away: string) => { hg: number; ag: number } | null {
  const grid = new Map<string, { hg: number; ag: number }>();
  for (const m of matches) if (m.stage_key === "regular") grid.set(`${m.home_team_id}|${m.away_team_id}`, { hg: m.home_goals, ag: m.away_goals });
  return (home, away) => grid.get(`${home}|${away}`) ?? null;
}

/** Short club code for a column head: the first three letters of the name, upper case ("ARS"). */
export const clubCode = (name: string): string => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
