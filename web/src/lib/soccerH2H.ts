import type { Match, TeamMatch } from "./soccer.ts";

/**
 * Head to head: every World Cup meeting of two national teams (the men's and the women's tournaments kept apart), worked out from the matches the
 * api already serves (api.soccer_matches, api.soccer_team_matches), so no view of its own is needed. Pure: no server code, so a test can run it.
 *
 * A match decided on penalties counts as a draw in the record, as everywhere on the World Cup pages (goals count to the end of extra time), and the
 * shootout is counted on the side (`aShootoutWins`, `bShootoutWins`) so a page can say who went through.
 *
 *   /worldcup/head-to-head/argentina-vs-france       the two team slugs, alphabetical, joined by "-vs-"
 */
export const H2H_PATH = "/worldcup/head-to-head";
const SEP = "-vs-";

/** The address of a pairing: the two slugs in alphabetical order, whichever way round they are given. */
export function h2hPath(a: string, b: string): string {
  const [x, y] = a <= b ? [a, b] : [b, a];
  return `${H2H_PATH}/${x}${SEP}${y}`;
}

/** The two slugs of a pairing's address segment ("argentina-vs-france"), in the order written; null when it is not two slugs joined by "-vs-". */
export function splitPair(seg: string): [string, string] | null {
  const parts = seg.split(SEP);
  if (parts.length !== 2) return null;
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slug.test(parts[0]) && slug.test(parts[1]) && parts[0] !== parts[1] ? [parts[0], parts[1]] : null;
}

/** The key two team ids share whichever way round they are given. */
export const pairKey = (a: string, b: string): string => (a <= b ? `${a}|${b}` : `${b}|${a}`);

/** Every pairing that has met in a World Cup, as `pairKey`s. */
export function metPairs(matches: { home_team_id: string; away_team_id: string }[]): Set<string> {
  return new Set(matches.map((m) => pairKey(m.home_team_id, m.away_team_id)));
}

export interface Summary {
  played: number;
  aWins: number;
  bWins: number;
  /** Matches level at the end of play, including those a shootout then decided. */
  draws: number;
  aShootoutWins: number;
  bShootoutWins: number;
  aGoals: number;
  bGoals: number;
  /** The widest win of each side (most goals ahead, then most goals in the match, then the earlier one); null when the side never won in play. */
  biggestA: Match | null;
  biggestB: Match | null;
  first: Match | null;
  last: Match | null;
  /** The stages the two met in, earliest first (stage_key). */
  stages: string[];
}

/** The goals of team `id` and of its opponent in match `m`. */
export const goalsOf = (m: Match, id: string): [number, number] => (m.home_team_id === id ? [m.home_goals, m.away_goals] : [m.away_goals, m.home_goals]);

const byDate = (x: Match, y: Match) => x.match_date.localeCompare(y.match_date) || x.match_id - y.match_id;

/** The record of team `a` against team `b` over `matches` (all of them between the two, oldest first or not). */
export function summarize(matches: Match[], a: string, b: string): Summary {
  const sorted = [...matches].sort(byDate);
  const s: Summary = { played: sorted.length, aWins: 0, bWins: 0, draws: 0, aShootoutWins: 0, bShootoutWins: 0, aGoals: 0, bGoals: 0, biggestA: null, biggestB: null, first: sorted[0] ?? null, last: sorted.at(-1) ?? null, stages: [] };
  const wider = (m: Match, cur: Match | null, id: string): Match => {
    if (!cur) return m;
    const [mf, ma] = goalsOf(m, id), [cf, ca] = goalsOf(cur, id);
    return mf - ma > cf - ca || (mf - ma === cf - ca && mf + ma > cf + ca) ? m : cur;
  };
  for (const m of sorted) {
    const [ga, gb] = goalsOf(m, a);
    s.aGoals += ga;
    s.bGoals += gb;
    if (ga > gb) { s.aWins++; s.biggestA = wider(m, s.biggestA, a); }
    else if (gb > ga) { s.bWins++; s.biggestB = wider(m, s.biggestB, b); }
    else {
      s.draws++;
      if (m.shootout && m.winner_team_id === a) s.aShootoutWins++;
      else if (m.shootout && m.winner_team_id === b) s.bShootoutWins++;
    }
  }
  const order = new Map<string, number>();
  for (const m of sorted) order.set(m.stage_key, Math.min(order.get(m.stage_key) ?? Infinity, m.stage_order));
  s.stages = [...order].sort((x, y) => x[1] - y[1]).map(([key]) => key);
  return s;
}

export interface OpponentRecord {
  opponent_id: string;
  opponent: string;
  opponent_slug: string;
  opponent_flag: string | null;
  league: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  /** Draws a shootout then decided, for and against. */
  pens_won: number;
  pens_lost: number;
  /** The year of the latest meeting. */
  last_year: number;
}

/** A team's record against each opponent in one competition (`league` "wc" or "wwc"), from its own matches (api.soccer_team_matches). */
export function opponentRecords(matches: TeamMatch[]): OpponentRecord[] {
  const out = new Map<string, OpponentRecord>();
  for (const m of matches) {
    const key = `${m.league}|${m.opponent_id}`;
    const r = out.get(key) ?? { opponent_id: m.opponent_id, opponent: m.opponent, opponent_slug: m.opponent_slug, opponent_flag: m.opponent_flag, league: m.league, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, pens_won: 0, pens_lost: 0, last_year: 0 };
    r.played++;
    r.goals_for += m.gf;
    r.goals_against += m.ga;
    if (m.gf > m.ga) r.won++;
    else if (m.gf < m.ga) r.lost++;
    else {
      r.drawn++;
      if (m.shootout && m.won_match === true) r.pens_won++;
      else if (m.shootout && m.won_match === false) r.pens_lost++;
    }
    r.last_year = Math.max(r.last_year, m.year);
    out.set(key, r);
  }
  return [...out.values()];
}
