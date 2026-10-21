/**
 * A club's Stanley Cup series up to 1926, when the Cup was still played between clubs of different leagues: from api.cup_final (the annual final, with its games, from 1915)
 * and api.cup_series (every challenge and league title since 1893). Pure; lib/cupHistory.ts reads the rows.
 */

export interface CupSeriesRow {
  year: number; seq: number; kind: string;
  winner_name: string; winner_league: string | null; winner_franchise: number | null;
  loser_name: string | null; loser_league: string | null; loser_franchise: number | null;
  format: string | null; score: string | null;
}

export interface CupFinalRow {
  year: number; first_day: string | null; last_day: string | null; format: string | null;
  team1_name: string; team1_league: string | null; team1_franchise: number | null;
  team2_name: string; team2_league: string | null; team2_franchise: number | null;
  team1_games: number | null; team2_games: number | null; winner_side: number | null;
}

export interface CupFinalGameRow {
  year: number; game_no: number; played_on: string | null; team1_score: number | null; team2_score: number | null;
  overtime_periods: number; home_side: number | null; venue_name: string | null; venue_city: string | null;
}

export interface CupGame { no: number; date: string | null; mine: number | null; theirs: number | null; overtimes: number; home: boolean | null; venue: string | null }

export interface CupAppearance {
  /** The calendar year the series ended in; the club's season is the one that began the year before. */
  year: number;
  /** `none`: the series had no winner (the final of 1919 was stopped), or it was a league title won while holding the Cup. */
  result: "won" | "lost" | "none";
  /** The other club as the source names it (null for a league title with no challenger), the league it played in, and its NHL franchise when core holds one. */
  opponent: string | null;
  opponentLeague: string | null;
  opponentFranchise: number | null;
  /** Games won, the club's first: "3–0". Null when the source gives none. */
  score: string | null;
  format: string | null;
  firstDay: string | null;
  lastDay: string | null;
  games: CupGame[];
}

const pair = (score: string | null): [number, number] | null => {
  const m = score ? /^(\d+)\D+(\d+)$/.exec(score.trim()) : null;
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/**
 * The Cup series franchise `f` played in, oldest first. A year with a final row is told from it (its games included); the rest from the series rows, a series
 * the club won or lost. A series row's score is the winner's first, so a loss is turned round to put the club first.
 */
export function cupAppearances(f: number, series: readonly CupSeriesRow[], finals: readonly CupFinalRow[], games: readonly CupFinalGameRow[]): CupAppearance[] {
  const out: CupAppearance[] = [];
  const finalYears = new Set(finals.map((x) => x.year));
  for (const x of finals) {
    const side = x.team1_franchise === f ? 1 : x.team2_franchise === f ? 2 : 0;
    if (!side) continue;
    const mine = side === 1 ? x.team1_games : x.team2_games, theirs = side === 1 ? x.team2_games : x.team1_games;
    out.push({
      year: x.year,
      result: x.winner_side == null ? "none" : x.winner_side === side ? "won" : "lost",
      opponent: side === 1 ? x.team2_name : x.team1_name,
      opponentLeague: side === 1 ? x.team2_league : x.team1_league,
      opponentFranchise: side === 1 ? x.team2_franchise : x.team1_franchise,
      score: mine != null && theirs != null ? `${mine}–${theirs}` : null,
      format: x.format, firstDay: x.first_day, lastDay: x.last_day,
      games: games.filter((g) => g.year === x.year).map((g) => ({
        no: g.game_no, date: g.played_on,
        mine: side === 1 ? g.team1_score : g.team2_score, theirs: side === 1 ? g.team2_score : g.team1_score,
        overtimes: g.overtime_periods, home: g.home_side == null ? null : g.home_side === side, venue: g.venue_name,
      })),
    });
  }
  for (const s of series) {
    if (finalYears.has(s.year)) continue;
    const won = s.winner_franchise === f, lost = s.loser_franchise === f;
    if (!won && !lost) continue;
    const p = pair(s.score);
    out.push({
      year: s.year,
      result: s.loser_name == null ? "none" : won ? "won" : "lost",
      opponent: won ? s.loser_name : s.winner_name,
      opponentLeague: won ? s.loser_league : s.winner_league,
      opponentFranchise: won ? s.loser_franchise : s.winner_franchise,
      score: p ? (won ? `${p[0]}–${p[1]}` : `${p[1]}–${p[0]}`) : s.score,
      format: s.format, firstDay: null, lastDay: null, games: [],
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

/** The final a league's champion played in the Cup year after its season began (the 1914-15 PCHA champion in 1915), when the champion was one of its two clubs. */
export function championFinal(champion: number | null, seasonStart: number, finals: readonly CupFinalRow[], series: readonly CupSeriesRow[], games: readonly CupFinalGameRow[]): CupAppearance | null {
  if (champion == null) return null;
  return cupAppearances(champion, series, finals, games).filter((a) => a.year === seasonStart + 1).at(-1) ?? null;
}
