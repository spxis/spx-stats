import type { Speaker } from "./i18n/i18n.ts";
import type { PhraseKey } from "./i18n/phrases.constants.ts";

/** The words for a stage (the data's stage_key), a team's furthest stage and a score, in one place. Pure: no server code. */

export const STAGE_PHRASE: Record<string, PhraseKey> = {
  group: "wc.stage.group",
  first_round: "wc.stage.firstRound",
  second_group: "wc.stage.secondGroup",
  final_round: "wc.stage.finalRound",
  round_of_32: "wc.stage.roundOf32",
  round_of_16: "wc.stage.roundOf16",
  quarter: "wc.stage.quarter",
  semi: "wc.stage.semi",
  third_place: "wc.stage.thirdPlace",
  final: "wc.stage.final",
};

/** The stage a team's `performance` text names ("quarter-finals", "round of 16") as a stage_key. */
const PERFORMANCE_STAGE: Record<string, string> = {
  "group stage": "group", "first group stage": "group", "first round": "first_round", "second group stage": "second_group",
  "final round": "final_round", "round of 32": "round_of_32", "round of 16": "round_of_16", "quarter-finals": "quarter", "quarter-final": "quarter",
  "semi-finals": "semi", "semi-final": "semi", "third-place match": "third_place", final: "final",
};

export const stageName = (say: Speaker["say"], key: string): string => (STAGE_PHRASE[key] ? say(STAGE_PHRASE[key]) : key);

/** How far a team went: Champions, Runners-up, Third place, Fourth place, else the stage it reached. */
export function reached(say: Speaker["say"], t: { performance: string | null; final_position: number | null }): string {
  switch (t.final_position) {
    case 1: return say("wc.reach.champions");
    case 2: return say("wc.reach.runnerUp");
    case 3: return say("wc.reach.third");
    case 4: return say("wc.reach.fourth");
  }
  const key = t.performance ? PERFORMANCE_STAGE[t.performance] : undefined;
  return key ? stageName(say, key) : (t.performance ?? "");
}

/** A rank for sorting "how far": champions highest. */
export function reachRank(t: { performance: string | null; final_position: number | null }): number {
  if (t.final_position) return 100 - t.final_position;
  const order: Record<string, number> = { group: 1, first_round: 1, second_group: 2, final_round: 3, round_of_32: 4, round_of_16: 5, quarter: 6, semi: 7, third_place: 8, final: 9 };
  return (t.performance ? order[PERFORMANCE_STAGE[t.performance] ?? ""] : 0) ?? 0;
}

interface Scored {
  home_goals: number; away_goals: number; extra_time: boolean; shootout: boolean; home_penalties: number | null; away_penalties: number | null;
}

/** "3–3" and, under it where there was one, "after extra time" / "4–2 on penalties". */
export function scoreLines(say: Speaker["say"], m: Scored): { main: string; note: string | null } {
  const main = `${m.home_goals}–${m.away_goals}`;
  if (m.shootout && m.home_penalties != null && m.away_penalties != null) {
    return { main, note: say("wc.score.pens", { home: m.home_penalties, away: m.away_penalties }) };
  }
  return { main, note: m.extra_time ? say("wc.score.aet") : null };
}

/** "Group A" in the reader's language (the data's group_name is "Group A" or "Group 1"). */
export const groupName = (say: Speaker["say"], group: string): string => say("wc.group", { name: group.replace(/^Group\s+/, "") });

/** The group a group-stage match was in, else the stage's name. */
export const groupLabel = (say: Speaker["say"], m: { stage_key: string; group_name: string | null }): string =>
  m.group_name && m.stage_key.includes("group") ? groupName(say, m.group_name) : stageName(say, m.stage_key);
