import { parseChampionNote } from "./series.ts";

/**
 * One season of a league's champions table as plain data (no server code: the league page, the route that serves the older seasons and the table in the
 * browser agree on it). A blank field is left out. The table draws its cells from this (components/ChampionsTable.tsx): the page sends the newest seasons
 * and the rest come from the league's `rows/champions` address when "Show all" is pressed or the table is sorted another way.
 */
export interface ChampLine {
  /** The season's year (its label and address come from the league). */
  y: number;
  /** The champion's name, its franchise and its logo that season (a place in the table's list of logos: a club keeps one for decades, and its address is long). */
  team?: string;
  f?: number;
  lo?: number;
  /** The source of the champion (a code, drawn as a badge). */
  src?: string;
  /** The final as a plain note, when it does not read "Won the final 4 games to 3 against X" or the series is not in the games. */
  note?: string;
  /** The final as links: the lead ("Won the final "), the score, the address of its series page, the words between ("against ") and the opponent (name, franchise, logo). */
  fin?: { a: string; s: string; h: string; m: string; o: string; of: number; ol?: number };
}

/** A league's champions, newest first, and the logos they point into. */
export interface ChampList { lines: ChampLine[]; logos: string[] }

/** How many of the newest seasons the league page itself carries. The rest are fetched when the reader asks for them (or sorts the table another way). */
export const CHAMP_HEAD = 12;

/** The address of the older seasons of a league's champions as JSON, and of the full list as a page of its own, from the league's code. */
export const champRestPath = (league: string): string => `/${league}/rows/champions`;
export const champPagePath = (league: string): string => `/${league}/champions`;

/** The text a final reads as: what the column sorts by and what a reader without the links sees. */
export const champNoteText = (c: ChampLine): string => (c.fin ? `${c.fin.a}${c.fin.s}${c.fin.m}${c.fin.o}` : c.note ?? "");

/** What the builder needs to know about one champion season. */
export interface ChampSeason { year: number; champion: string | null; champion_franchise: number | null; champion_note: string | null; champion_source: string | null }
/** What the builder asks of the server: a club's logo that season, and a final found among the playoff games (null where the games do not hold it). */
export interface ChampLookup {
  logo: (franchise: number | null | undefined, year: number) => string | null | undefined;
  final: (year: number, champ: number, opponent: string) => { opp: number; href: string } | null;
}

/** The champions as plain data, in the order given (newest first), with the logo list their `lo` fields point into. */
export function buildChampLines(seasons: readonly ChampSeason[], look: ChampLookup): ChampList {
  const logos: string[] = [];
  const place = (logo: string | null | undefined): number | undefined => {
    if (!logo) return undefined;
    let i = logos.indexOf(logo);
    if (i < 0) i = logos.push(logo) - 1;
    return i;
  };
  const lines = seasons.map((x): ChampLine => {
    const l: ChampLine = { y: x.year };
    if (x.champion) l.team = x.champion;
    if (x.champion_franchise != null) {
      l.f = x.champion_franchise;
      const lo = place(look.logo(x.champion_franchise, x.year));
      if (lo != null) l.lo = lo;
    }
    if (x.champion_source) l.src = x.champion_source;
    const text = x.champion_note ?? "";
    const p = parseChampionNote(text);
    const found = p && x.champion_franchise != null ? look.final(x.year, x.champion_franchise, p.opp) : null;
    if (p && found) {
      const ol = place(look.logo(found.opp, x.year));
      l.fin = { a: p.lead, s: p.score.replace(/\s*-\s*/, "–"), h: found.href, m: p.mid, o: p.opp, of: found.opp, ...(ol != null ? { ol } : {}) };
    } else if (text) l.note = text;
    return l;
  });
  return { lines, logos };
}

/**
 * The first `head` lines and the logos they use. Logos are numbered in the order the lines meet them, so the lines of the head use the first of the list:
 * the page carries only those, the route that serves the rest carries them all.
 */
export function champHead(list: ChampList, head: number): ChampList {
  const lines = list.lines.slice(0, head);
  let used = 0;
  for (const l of lines) used = Math.max(used, (l.lo ?? -1) + 1, (l.fin?.ol ?? -1) + 1);
  return { lines, logos: list.logos.slice(0, used) };
}
