/**
 * The figures behind the boxes above a season's standings: the best home and road records, and the longest winning and
 * losing streaks of a finished season. Pure; the streak rules (what ends a run) are lib/streaks.ts.
 */

import { teamStreaks, type Result, type Run } from "./streaks.ts";

export interface Record3 { w: number; l: number; x: number; share: number; text: string }

/**
 * A home or road record as written in the standings ("29-8-4", "30–11") as its wins, losses, the rest, and the share of games won.
 * With `countsOtl` a third number is overtime losses (no credit, as in the standings' own share); otherwise it is ties, which count half.
 * A fourth number is overtime losses after ties. Null for a blank or empty record.
 */
export function parseRecord(rec: string | null | undefined, countsOtl: boolean): Record3 | null {
  const n = String(rec ?? "").match(/\d+/g)?.map(Number);
  if (!n || n.length < 2) return null;
  const [w, l, third = 0, fourth = 0] = n;
  const ties = n.length === 3 && countsOtl ? 0 : third;
  const games = w + l + third + fourth;
  if (!games) return null;
  return { w, l, x: third + fourth, share: (w + ties / 2) / games, text: n.join("–") };
}

export interface BestSide {
  share: number;
  w: number;
  l: number;
  text: string;
  /** Every team with that record (same share, same wins), in the order given. */
  teams: number[];
}

const SAME = 1e-9;

/** The team (and any team level with it) with the best home (or road) record: the highest share of games won, wins breaking a tie. */
export function bestSide(rows: { team_id: number; home: string | null; road: string | null }[], side: "home" | "road", countsOtl: boolean): BestSide | null {
  let best: BestSide | null = null;
  for (const r of rows) {
    const rec = parseRecord(r[side], countsOtl);
    if (!rec) continue;
    if (!best || rec.share > best.share + SAME || (Math.abs(rec.share - best.share) <= SAME && rec.w > best.w)) {
      best = { share: rec.share, w: rec.w, l: rec.l, text: rec.text, teams: [r.team_id] };
    } else if (Math.abs(rec.share - best.share) <= SAME && rec.w === best.w) {
      best.teams.push(r.team_id);
    }
  }
  return best;
}

export interface SeasonRun { team: number; run: Run }

/**
 * The longest winning (or losing) streak any side had in the season: its team, length and dates. Sides level at the longest length
 * follow in the order their runs began (the earliest first). Null when no run reaches `min` games.
 */
export function longestOfSeason(results: Map<number, Result[]>, kind: "W" | "L", min = 2): { length: number; runs: SeasonRun[] } | null {
  const found: SeasonRun[] = [];
  for (const [team, list] of results) {
    const s = teamStreaks(list);
    const run = kind === "W" ? s.win : s.loss;
    if (run && run.length >= min) found.push({ team, run });
  }
  if (!found.length) return null;
  const length = Math.max(...found.map((f) => f.run.length));
  const runs = found.filter((f) => f.run.length === length).sort((a, b) => (a.run.from < b.run.from ? -1 : a.run.from > b.run.from ? 1 : 0));
  return { length, runs };
}
