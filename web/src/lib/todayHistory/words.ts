/**
 * The sentences of "Today in history" (components/TodayInHistory.tsx). A fact comes from the meigen-sports data as one full sentence with its date in it
 * ("On February 8, 1987, the NHL All-Star Game was played at ..."); the block puts the year in front, so the date is taken out of the sentence here, and a
 * sentence that does not have the shape this expects is dropped by the build (scripts/todayHistoryBuild.ts), never guessed at.
 */

const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
const FULL_DATE = `${MONTH} \\d{1,2}, \\d{4}`;
const LEAD = new RegExp(`^On ${FULL_DATE}, `);
const INSIDE = new RegExp(` on ${FULL_DATE}`);
/** The league in brackets some game sentences end with ("... 108–83, playoffs (NBA)."). The page it sits on already says the league. */
const LEAGUE_TAIL = / \((?:NHL|NBA|MLB|NFL|CFL)\)\.$/;
/** A final's sentence goes on with the club's title count and regular-season record; the block keeps the result. */
const FINAL_TAIL = /\. (?:It was their|They had finished)\b.*$/;

export type HistoryKind = "championship-final" | "all-star" | "game-feat" | "retired-number" | "player-birthday" | "player-death" | "game-on-day";
/** The kinds a day may show, best first. Anything else the data holds (a club "began this identity", an award row repeating a final) is left out. */
export const KINDS: readonly HistoryKind[] = ["championship-final", "all-star", "game-feat", "retired-number", "player-birthday", "player-death", "game-on-day"];
export const isKind = (k: string): k is HistoryKind => (KINDS as readonly string[]).includes(k);

/** The sentence without its date (the year is drawn in front of it), or null when it has no date in the shape the data always uses. */
export function withoutDate(kind: HistoryKind, text: string): string | null {
  let t = text.trim();
  if (LEAD.test(t)) {
    t = t.replace(LEAD, "");
    t = t[0].toUpperCase() + t.slice(1);
  } else if (INSIDE.test(t)) t = t.replace(INSIDE, "");
  else return null;
  if (kind === "championship-final") t = t.replace(FINAL_TAIL, ".");
  t = t.replace(LEAGUE_TAIL, ".");
  return new RegExp(FULL_DATE).test(t) || /\(none\)|undefined|null/.test(t) || t.length < 12 ? null : t;
}

export interface CupFinalRow {
  year: number;
  winnerSide: 1 | 2;
  team1: string;
  team2: string;
  team1Games: number;
  team2Games: number;
  game: { no: number; playedOn: string; team1Score: number; team2Score: number; venue: string | null; city: string | null };
}

/** One sentence for the game that decided a Stanley Cup final, worded like the data's other finals ("... won the 1960 NBA Finals, beating the ... with a ... win in Game 7 at ..."). */
export function cupFinalText(f: CupFinalRow): string {
  const [won, lost] = f.winnerSide === 1 ? [f.team1, f.team2] : [f.team2, f.team1];
  const [wg, lg] = f.winnerSide === 1 ? [f.team1Games, f.team2Games] : [f.team2Games, f.team1Games];
  const [ws, ls] = f.winnerSide === 1 ? [f.game.team1Score, f.game.team2Score] : [f.game.team2Score, f.game.team1Score];
  const how = lg === 0 ? `sweeping the ${lost} ${wg}–0` : `beating the ${lost} ${wg} games to ${lg}`;
  const where = f.game.venue ? ` at ${[f.game.venue, f.game.city].filter(Boolean).join(", ")}` : "";
  return `${won} won the ${f.year} Stanley Cup, ${how} with a ${ws}–${ls} win in Game ${f.game.no}${where}.`;
}

/** A name with its accents, case and punctuation taken off: how a person of the data is matched with a person of the database. */
export const plainName = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
