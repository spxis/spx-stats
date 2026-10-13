import type { Locale } from "@/lib/locale";

/**
 * Positions are codes from a fixed list per league (ref.position, served by api.position): NHL C, LW, RW, D, G; MLB P, C, 1B, SS, ...;
 * NFL and CFL QB, RB, WR, ... Tables show the short code; the player page shows the name in the reader's language.
 */
export interface PositionRow {
  league: string;
  code: string;
  sort: number;
  group: string;
  name_en: string;
  name_fr: string;
  name_ja: string;
}

/** What an older address or API call may say instead of a code (the words the archive used before the fixed lists), lower case. */
const WORDS: Record<string, string> = {
  c: "C", centre: "C", center: "C", catcher: "C",
  l: "LW", lw: "LW", "left wing": "LW", "left winger": "LW",
  r: "RW", rw: "RW", "right wing": "RW", "right winger": "RW",
  d: "D", defenseman: "D", defenceman: "D", defender: "D",
  g: "G", goaltender: "G", goalie: "G", guard: "G",
  pitcher: "P", "starting pitcher": "P", "relief pitcher": "P", closer: "P", punter: "P",
  "first baseman": "1B", "second baseman": "2B", "third baseman": "3B", shortstop: "SS",
  "left fielder": "LF", "center fielder": "CF", "right fielder": "RF", outfielder: "OF", infielder: "IF", "designated hitter": "DH", "two-way player": "TWP",
  "point guard": "PG", "shooting guard": "SG", "small forward": "SF", "power forward": "PF", forward: "F",
  quarterback: "QB", "running back": "RB", halfback: "RB", fullback: "FB", "wide receiver": "WR", "tight end": "TE", tackle: "T",
  "offensive tackle": "T", linebacker: "LB", "defensive end": "DE", "defensive tackle": "DT", "defensive lineman": "DL", "defensive back": "DB",
  cornerback: "CB", safety: "S", placekicker: "K", kicker: "K", slotback: "SB",
};

/**
 * The code a position text means: a code is returned as it is (upper case); an older word ("Defenseman", "left winger") as its code;
 * anything else null. Used so old addresses such as `?position=Defenseman` keep working.
 */
export function positionCode(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const word = WORDS[t.toLowerCase()];
  if (word) return word;
  return /^[A-Za-z0-9]{1,3}(-[A-Za-z0-9]{1,3})?$/.test(t) ? t.toUpperCase() : null;
}

/** The codes of a person, the main one first, each once: from the list when it has one, else the main position alone. Older words become their codes. */
export function positionCodes(positions: readonly string[] | null | undefined, position?: string | null): string[] {
  const list = positions?.length ? positions : position ? [position] : [];
  return [...new Set(list.map((p) => positionCode(p) ?? p.trim()).filter(Boolean))];
}

/** The short form for a table cell: "C / LW"; empty when the person has none. */
export function positionsShort(positions: readonly string[] | null | undefined, position?: string | null): string {
  return positionCodes(positions, position).join(" / ");
}

const NAME = { en: "name_en", fr: "name_fr", ja: "name_ja" } as const;

/**
 * The names of a person's positions in the reader's language, "Pitcher / Designated hitter". The league of the page picks the list
 * (C is a centre in the NHL and a catcher in MLB); a code that list lacks is looked up in the others, and one nobody holds is shown as it is.
 */
export function positionNames(codes: readonly string[], league: string | null, list: readonly PositionRow[], locale: Locale): string {
  const key = NAME[locale];
  return codes.map((c) => {
    const hit = list.find((r) => r.code === c && r.league === league) ?? list.find((r) => r.code === c);
    return hit ? hit[key] : c;
  }).join(" / ");
}
