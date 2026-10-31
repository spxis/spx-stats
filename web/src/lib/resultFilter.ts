/** The Wins / Losses / Ties / OT losses filter of a team's games table: the shape of ?result= in the address. */
import type { PhraseKey } from "./i18n/phrases.constants";
import { oneOf } from "./queryParam.ts";
import type { Result } from "./teamSeason";

export type ResultFilter = "all" | "win" | "loss" | "tie" | "otl";

/** ?result=win|loss|tie|otl|all : anything else is all. */
export const parseResult = (raw: unknown): ResultFilter => oneOf(raw, ["all", "win", "loss", "tie", "otl"] as const) ?? "all";

export const RESULTS: readonly (readonly [ResultFilter, Result, PhraseKey])[] = [
  ["all", "", "result.all"], ["win", "W", "result.win"], ["loss", "L", "result.loss"], ["tie", "T", "result.tie"], ["otl", "OTL", "result.lostOt"],
];

/** The choices a team's games offer: ties and overtime losses only when the games hold one. */
export function resultOptions(games: readonly { res: string }[]): ResultFilter[] {
  const has = new Set(games.map((g) => g.res));
  return RESULTS.filter(([, code]) => code === "" || code === "W" || code === "L" || has.has(code)).map(([k]) => k);
}

export const matchesResult = (g: { res: string }, r: ResultFilter) => r === "all" || g.res === RESULTS.find(([k]) => k === r)![1];
