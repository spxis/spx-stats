import type { Speaker } from "./i18n/i18n.ts";
import type { PhraseKey } from "./i18n/phrases.constants.ts";

/** The words for an MLS stage (the data's stage_key), a club's playoff result, a score, and the playoff ties built from the matches. Pure: no server code. */

export const MLS_STAGE_PHRASE: Record<string, PhraseKey> = {
  regular: "mls.stage.regular",
  wild_card: "mls.stage.wildCard",
  round_one: "mls.stage.roundOne",
  conference_semi: "mls.stage.confSemi",
  conference_final: "mls.stage.confFinal",
  final: "mls.stage.final",
};

export const mlsStageName = (say: Speaker["say"], key: string): string => (MLS_STAGE_PHRASE[key] ? say(MLS_STAGE_PHRASE[key]) : key);

/** A club's season result: the stage it last played in (the `performance` of the data), champion, or no playoffs. */
const REACH_PHRASE: Record<string, PhraseKey> = {
  champion: "mls.reach.champion",
  final: "mls.reach.final",
  conference_final: "mls.reach.confFinal",
  conference_semi: "mls.reach.confSemi",
  round_one: "mls.reach.roundOne",
  wild_card: "mls.reach.wildCard",
  missed: "mls.reach.missed",
};
const REACH_RANK: Record<string, number> = { champion: 7, final: 6, conference_final: 5, conference_semi: 4, round_one: 3, wild_card: 2, missed: 0 };

export const mlsReached = (say: Speaker["say"], performance: string | null): string => (performance && REACH_PHRASE[performance] ? say(REACH_PHRASE[performance]) : "");
/** For sorting "how far": champion highest, no playoffs lowest. */
export const mlsReachRank = (performance: string | null): number => (performance ? (REACH_RANK[performance] ?? 0) : 0);

interface Scored {
  home_goals: number; away_goals: number; extra_time: boolean; shootout: boolean; home_penalties: number | null; away_penalties: number | null;
  shootout_style?: string | null | undefined; winner_team_id: string | null; home_team_id: string; home: string; away: string;
}

/** "2–2" and, under it where there was one, "after extra time", "4–2 on penalties" or (1996-1999) "Tampa Bay won the shootout". */
export function mlsScoreLines(say: Speaker["say"], m: Scored): { main: string; note: string | null } {
  const main = `${m.home_goals}–${m.away_goals}`;
  if (m.shootout && m.home_penalties != null && m.away_penalties != null) return { main, note: say("wc.score.pens", { home: m.home_penalties, away: m.away_penalties }) };
  if (m.shootout_style === "mls" && m.winner_team_id) return { main, note: say("mls.score.so", { team: m.winner_team_id === m.home_team_id ? m.home : m.away }) };
  return { main, note: m.extra_time ? say("wc.score.aet") : null };
}

export interface TieMatch {
  match_id: number; year: number; stage_key: string; stage_order: number; match_date: string; home_team_id: string; away_team_id: string;
  home: string; away: string; home_slug: string; away_slug: string; home_goals: number; away_goals: number; extra_time: boolean; shootout: boolean;
  home_penalties: number | null; away_penalties: number | null; winner_team_id: string | null;
}

export interface Tie<M extends TieMatch = TieMatch> {
  stage_key: string; stage_order: number;
  a: { id: string; name: string; slug: string }; b: { id: string; name: string; slug: string };
  matches: M[];
  /** What each side shows beside its name: its goal in a single match, the aggregate over two, the games won over three or more. */
  aFigure: number; bFigure: number;
  /** "2–1 · 0–0": each game from the first-named side's point of view. */
  games: string;
  winner: string | null;
}

/**
 * The playoff matches as ties: the matches of one round between the same two clubs. The winner of a tie is the club that plays in a later
 * round (the champion for the final), so a series decided any way (best of three, two legs on aggregate, one match, penalties) needs no rule here.
 * The last round of a season still being played has no winner yet.
 */
export function playoffTies<M extends TieMatch>(matches: M[], champion: string | null): Tie<M>[] {
  const playoff = matches.filter((m) => m.stage_key !== "regular");
  const ties = new Map<string, Tie<M>>();
  for (const m of [...playoff].sort((x, y) => x.match_date.localeCompare(y.match_date) || x.match_id - y.match_id)) {
    const key = `${m.stage_order}|${[m.home_team_id, m.away_team_id].sort().join("|")}`;
    let t = ties.get(key);
    if (!t) {
      t = {
        stage_key: m.stage_key, stage_order: m.stage_order,
        a: { id: m.home_team_id, name: m.home, slug: m.home_slug }, b: { id: m.away_team_id, name: m.away, slug: m.away_slug },
        matches: [], aFigure: 0, bFigure: 0, games: "", winner: null,
      };
      ties.set(key, t);
    }
    t.matches.push(m);
  }
  const later = (order: number) => new Set(playoff.filter((m) => m.stage_order > order).flatMap((m) => [m.home_team_id, m.away_team_id]));
  for (const t of ties.values()) {
    const goals = (m: M, id: string) => (m.home_team_id === id ? m.home_goals : m.away_goals);
    const wins = (id: string) => t.matches.filter((m) => m.winner_team_id === id).length;
    if (t.matches.length === 1) { t.aFigure = goals(t.matches[0], t.a.id); t.bFigure = goals(t.matches[0], t.b.id); }
    else if (t.matches.length === 2) { t.aFigure = t.matches.reduce((n, m) => n + goals(m, t.a.id), 0); t.bFigure = t.matches.reduce((n, m) => n + goals(m, t.b.id), 0); }
    else { t.aFigure = wins(t.a.id); t.bFigure = wins(t.b.id); }
    t.games = t.matches.map((m) => `${goals(m, t.a.id)}–${goals(m, t.b.id)}`).join(" · ");
    const next = later(t.stage_order);
    const advanced = [t.a.id, t.b.id].filter((id) => next.has(id));
    if (t.stage_key === "final") t.winner = champion && [t.a.id, t.b.id].includes(champion) ? champion : t.matches.at(-1)?.winner_team_id ?? null;
    else if (advanced.length === 1) t.winner = advanced[0];
  }
  return [...ties.values()].sort((x, y) => x.stage_order - y.stage_order || x.matches[0].match_date.localeCompare(y.matches[0].match_date));
}
