import type { BoardData, ClubInfo, SeasonInfo, StatRow } from "./playerBoard.ts";

/**
 * A board as the page sends it. The team names, logo addresses and colours are written once in lists that the rows point into, a stat row is a list
 * of its numbers in the column order of its group, and a club-season is three list positions, so a long career is a few KB instead of tens. The browser
 * turns it back into the BoardData the board draws from (`readBoard`); `packBoard` is its exact inverse (scripts/player.test.ts).
 */
export type StatWire = [league: string, year: number, ts: number, f: number, team: number, playoffs: 0 | 1, group: string, values: (number | null)[]];
export type SeasonWire = [league: string, year: number, label: string, f: number, team: number, flags: number];
export type ClubWire = [team: number, logo: number, tone: number];

export interface BoardWire {
  name: string;
  min: number;
  max: number;
  bucket: BoardData["bucket"];
  position: string | null;
  /** Team names, logo addresses and colours, each once. */
  names: string[];
  logos: string[];
  tones: string[];
  /** The stat keys of each group, in the order of the numbers in its rows. */
  keys: Record<string, string[]>;
  stats: StatWire[];
  seasons: SeasonWire[];
  clubs: Record<string, ClubWire>;
  titles: BoardData["titles"];
  awards: BoardData["awards"];
  held: string[];
}

const FLAG = { reg: 1, po: 2, teamPo: 4, champ: 8 } as const;

/** A list that gives each distinct value one position (-1 for none). */
function table<T>() {
  const list: T[] = [], at = new Map<T, number>();
  return { list, id: (v: T | null | undefined): number => { if (v == null) return -1; let i = at.get(v); if (i == null) { i = list.length; at.set(v, i); list.push(v); } return i; } };
}

export function packBoard(b: BoardData): BoardWire {
  const names = table<string>(), logos = table<string>(), tones = table<string>();
  const keySets = new Map<string, Set<string>>();
  for (const s of b.stats) { const set = keySets.get(s.group) ?? new Set<string>(); for (const k of Object.keys(s.stats)) set.add(k); keySets.set(s.group, set); }
  const keys: Record<string, string[]> = {};
  for (const [g, set] of keySets) keys[g] = [...set].sort();
  const stats = b.stats.map((s): StatWire => [s.league, s.year, s.ts, s.f, names.id(s.team), s.phase === "playoffs" ? 1 : 0, s.group, keys[s.group].map((k) => (k in s.stats ? s.stats[k] : null))]);
  const seasons = b.seasons.map((s): SeasonWire => [s.league, s.year, s.label, s.f, names.id(s.team), (s.reg ? FLAG.reg : 0) | (s.po ? FLAG.po : 0) | (s.teamPo ? FLAG.teamPo : 0) | (s.champ ? FLAG.champ : 0)]);
  const clubs: Record<string, ClubWire> = {};
  for (const [k, c] of Object.entries(b.clubs)) clubs[k] = [names.id(c.team), logos.id(c.logo), tones.id(c.tone)];
  return { name: b.name, min: b.min, max: b.max, bucket: b.bucket, position: b.position, names: names.list, logos: logos.list, tones: tones.list, keys, stats, seasons, clubs, titles: b.titles, awards: b.awards, held: b.held };
}

export function readBoard(w: BoardWire): BoardData {
  const name = (i: number): string | null => (i < 0 ? null : w.names[i]);
  const stats = w.stats.map(([league, year, ts, f, team, po, group, values]): StatRow => {
    const cols = w.keys[group], stats: Record<string, number> = {};
    cols.forEach((k, i) => { const v = values[i]; if (v != null) stats[k] = v; });
    return { league, year, ts, f, team: name(team), phase: po ? "playoffs" : "regular", group, stats };
  });
  const seasons = w.seasons.map(([league, year, label, f, team, flags]): SeasonInfo =>
    ({ league, year, label, f, team: name(team), reg: !!(flags & FLAG.reg), po: !!(flags & FLAG.po), teamPo: !!(flags & FLAG.teamPo), champ: !!(flags & FLAG.champ) }));
  const clubs: Record<string, ClubInfo> = {};
  for (const [k, [team, logo, tone]] of Object.entries(w.clubs)) clubs[k] = { team: name(team), logo: logo < 0 ? null : w.logos[logo], tone: w.tones[tone] };
  return { name: w.name, min: w.min, max: w.max, bucket: w.bucket, position: w.position, stats, seasons, clubs, titles: w.titles, awards: w.awards, held: w.held };
}
