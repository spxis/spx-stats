/**
 * The postseason of a league that tells it as games, not series: college football's bowl games, the College Football Playoff and the conference
 * championship games, each game with the label the archive holds (core.game.round_label, api.game_round). Pure: the page hands over the games.
 */

import { PHRASES } from "./i18n/phrases.constants.ts";

export type PostGroupId = "title" | "playoff" | "bowl" | "conference";
/** The order the groups are drawn in. */
export const POST_GROUPS: readonly PostGroupId[] = ["title", "playoff", "bowl", "conference"];

export interface PostGame {
  id: number;
  date: string;
  phase: "r" | "p" | string;
  label: string | null;
  /** The two sides, with the score when the game was played. */
  a: { id: number; f: number | null; name: string; score: number | null };
  b: { id: number; f: number | null; name: string; score: number | null };
}

const CONFERENCE_GAME = /Championship Game$/i;
const TITLE_NAME = /National Championship/i;
const PLAYOFF_TAG = /\bCFP\b|^College Football Playoff\b/i;
const ROUND_ORDER: [RegExp, number][] = [[/First Round/i, 1], [/Quarterfinal/i, 2], [/Semifinal/i, 3], [/National Championship/i, 4]];

/** The name of the game the champion's note names: "(game: Rose Bowl (National Championship Game))" is "Rose Bowl (National Championship Game)". */
export function titleGameOf(note: string | null | undefined): string | null {
  const m = /\(game: (.+)\)\s*$/.exec(note ?? "");
  return m ? m[1] : null;
}

/** Whether the champion's note says the NCAA vacated the title (USC, 2004). */
export const isVacated = (note: string | null | undefined): boolean => /vacated/i.test(note ?? "");

/** Where a game belongs. `titleLabel` is the label of the national championship game, as the champion's note names it (it can be a plain bowl: the 2003 Sugar Bowl). */
export function groupOf(g: Pick<PostGame, "phase" | "label">, titleLabel: string | null): PostGroupId | null {
  const label = g.label ?? "";
  if (g.phase === "r") return CONFERENCE_GAME.test(label) ? "conference" : null;
  if (g.phase !== "p") return null;
  if (TITLE_NAME.test(label) || (titleLabel != null && label === titleLabel)) return "title";
  return PLAYOFF_TAG.test(label) ? "playoff" : "bowl";
}

/** A game of the Playoff by round (1 first round, 2 quarterfinal, 3 semifinal, 4 final); 0 for a game that names none. */
export function playoffRound(label: string | null): number {
  return ROUND_ORDER.find(([re]) => re.test(label ?? ""))?.[1] ?? 0;
}

/** The label with the tag of its round taken out, to show the bowl ("Rose Bowl (CFP Semifinal)" is the Rose Bowl, a semifinal). */
export function bowlName(label: string | null): string {
  return (label ?? "").replace(/\s*\((?:CFP [^)]*|National Championship Game)\)\s*$/i, "").trim();
}

/** The round named in a label's brackets ("CFP Semifinal" in "Rose Bowl (CFP Semifinal)"), or "". */
export function roundTag(label: string | null): string {
  const m = /\((CFP [^)]*)\)\s*$/i.exec(label ?? "");
  return m ? m[1].replace(/^CFP\s+/i, "") : "";
}

/**
 * The national championship game itself: of the games that are in the title group, the last one played (a season's Playoff has semifinals that
 * carry the name of a bowl, and only the final carries the name of the title game). null when the archive holds no such game.
 */
export function titleGame(games: readonly PostGame[], titleLabel: string | null): PostGame | null {
  const cands = games.filter((g) => groupOf(g, titleLabel) === "title");
  return cands.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id))[0] ?? null;
}

/**
 * A national champion's note as a sentence, in English, for the champions table (its rows are language-neutral data): "Won the Rose Bowl (National Championship
 * Game)." or "Won the Sugar Bowl, that year's national championship game.", with the vacated title said. The page's banner says the same through the catalogue.
 */
export function ncaafChampNote(note: string | null | undefined): string {
  const game = titleGameOf(note);
  if (!game) return note ?? "";
  const text = (/National Championship/i.test(game) ? PHRASES["ncaaf.champWon"] : PHRASES["ncaaf.champWonTitle"]).replace("{game}", game);
  return isVacated(note) ? `${text} ${PHRASES["post.vacated"]}` : text;
}
