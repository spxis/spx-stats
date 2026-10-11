/** The Wins / Losses / Ties / OT losses filter of a team's games table: the shape of ?result= in the address. */
import { z } from "zod";
import type { PhraseKey } from "./i18n/phrases.constants";
import type { Result, TeamGame } from "./teamSeason";

export type ResultFilter = "all" | "win" | "loss" | "tie" | "otl";

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** ?result=win|loss|tie|otl|all : anything else is all. */
export const resultSchema = z.preprocess(first, z.enum(["all", "win", "loss", "tie", "otl"])).catch("all");
export const parseResult = (raw: unknown): ResultFilter => resultSchema.parse(raw);

export const RESULTS: readonly (readonly [ResultFilter, Result, PhraseKey])[] = [
  ["all", "", "result.all"], ["win", "W", "result.win"], ["loss", "L", "result.loss"], ["tie", "T", "result.tie"], ["otl", "OTL", "result.lostOt"],
];

/** The choices a team's games offer: ties and overtime losses only when the games hold one. */
export function resultOptions(games: TeamGame[]): ResultFilter[] {
  const has = new Set(games.map((g) => g.res));
  return RESULTS.filter(([, code]) => code === "" || code === "W" || code === "L" || has.has(code)).map(([k]) => k);
}

export const matchesResult = (g: TeamGame, r: ResultFilter) => r === "all" || g.res === RESULTS.find(([k]) => k === r)![1];
