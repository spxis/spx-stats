/**
 * The arithmetic behind the player page's Compare window: what the route sends for a player, the career figures set side by side, the totals and
 * per-game rates of the stat groups both players have, the best season and the radar of the two against their leagues. Pure and free of React, so
 * the window draws from it and a node script tests it (scripts/playerCompare.test.ts). A figure that cannot be worked out is null and has no winner.
 */
import { enoughPlayed, GROUPS, groupViews, indexRefs, metricOf, peakSeason, radarOf, unpackRef, type BoardData, type GroupView, type Phase, type RefIndex } from "./playerBoard.ts";
import type { StatKind } from "./playerStats.ts";

/** What the window shows about a person apart from the statistics. */
export interface CompareFacts {
  born: string | null;
  died: string | null;
  place: string | null;
  /** Capitals ISO code of the birth country, else of the nationality. */
  country: string | null;
  heightCm: number | null;
  hof: number | null;
  positions: string[];
  leagues: string[];
  first: number | null;
  last: number | null;
}

/** A position of a league with its name in each language: league, code, English, French, Japanese. */
export type PositionName = [string, string, string, string, string];

/** The answer of /api/players/<id>/compare. `board` is null for a person with no playing record (a coach). */
export interface CompareData {
  id: number;
  name: string;
  /** The address of the person's page. */
  path: string;
  /** The league the page lives under. */
  home: string;
  facts: CompareFacts;
  board: BoardData | null;
  positions: PositionName[];
}

export type Win = "a" | "b" | "tie" | null;

/** Which side has the better figure; null when either is missing. `low`: a lower figure is better (ERA). */
export function winner(a: number | null, b: number | null, low = false): Win {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  if (a === b) return "tie";
  return (low ? a < b : a > b) ? "a" : "b";
}

/** One player as the window holds them for a phase: the board data, the league figures indexed, the stat groups over the whole career. */
export interface Side {
  data: CompareData;
  board: BoardData;
  refs: RefIndex;
  groups: GroupView[];
}

const ALL = { from: -Infinity, to: Infinity };

export function sideOf(data: CompareData, phase: Phase): Side | null {
  const board = data.board;
  if (!board) return null;
  return { data, board, refs: indexRefs(board.refs.map(unpackRef)), groups: groupViews(board.stats, ALL, phase, new Set(), board.position).filter((g) => g.rows.length > 0) };
}

// ---- the career ---------------------------------------------------------------------------------------------------------------------------

export interface CareerRow { id: "seasons" | "clubs" | "titles" | "awards"; a: number | null; b: number | null; win: Win }

const seasonsOf = (b: BoardData): number => new Set([...b.seasons.map((s) => `${s.league}|${s.year}`), ...b.stats.map((s) => `${s.league}|${s.year}`)]).size;
const clubsOf = (b: BoardData): number => new Set([...b.seasons.map((s) => `${s.league}:${s.f}`), ...b.stats.map((s) => `${s.league}:${s.f}`)]).size;

/** Seasons played, clubs, titles and awards of two players. Without a playing record a person has no figure. */
export function careerRows(a: BoardData | null, b: BoardData | null): CareerRow[] {
  const pair = (id: CareerRow["id"], get: (x: BoardData) => number): CareerRow => {
    const x = a ? get(a) : null, y = b ? get(b) : null;
    return { id, a: x, b: y, win: id === "clubs" ? null : winner(x, y) };
  };
  return [pair("seasons", seasonsOf), pair("clubs", clubsOf), pair("titles", (x) => x.titles.length), pair("awards", (x) => x.awards.length)];
}

// ---- the statistics of a group both have --------------------------------------------------------------------------------------------------

/** The stat groups both players have played in (in the first player's order), in the phase chosen. */
export function commonGroups(a: Side, b: Side): string[] {
  const mine = new Set(b.groups.map((g) => g.def.id));
  return a.groups.map((g) => g.def.id).filter((id) => mine.has(id));
}

/** More of these is not better (or means nothing either way): penalty minutes, fumbles, interceptions thrown. */
const NO_WINNER = new Set(["skater.pim", "rushing.fum", "passing.int"]);

export interface StatLine {
  id: string;
  /** Phrase key of the long name. */
  title: string;
  kind: StatKind;
  a: number | null;
  b: number | null;
  win: Win;
  /** The per-game (or per-nine) figure of a counting stat. */
  per?: { unit: "game" | "nine"; a: number | null; b: number | null; win: Win };
}

/** The hero stats of a group for two players: the total (a rate its own figure) with a winner, and for a counting stat the figure per game or per nine. A rate needs enough played on both sides to name a winner. */
export function statLines(groupId: string, a: Side, b: Side): StatLine[] {
  const ga = a.groups.find((g) => g.def.id === groupId), gb = b.groups.find((g) => g.def.id === groupId);
  if (!ga || !gb) return [];
  const phase = phaseOf(ga);
  const enough = enoughPlayed(groupId, phase, ga.total) && enoughPlayed(groupId, phase, gb.total);
  return ga.def.hero.map((h) => metricOf(ga.def, h.id)).filter((m, i, all) => all.indexOf(m) === i).map((m) => {
    const x = m.get(ga.total), y = m.get(gb.total);
    const free = NO_WINNER.has(`${groupId}.${m.id}`);
    const line: StatLine = { id: m.id, title: m.title, kind: m.kind, a: x, b: y, win: free || (!m.sum && !enough) ? null : winner(x, y, m.low) };
    if (m.per) {
      const px = m.per.get(ga.total), py = m.per.get(gb.total);
      line.per = { unit: m.per.unit, a: px, b: py, win: free || !enough ? null : winner(px, py, m.low) };
    }
    return line;
  });
}

const phaseOf = (g: GroupView): Phase => (g.rows[0]?.phase ?? "regular");

export interface Peak { year: number; value: number }

/** The season with the most of the group's headline stat, with that figure. */
export function peakOf(g: GroupView): Peak | null {
  const m = g.def.metrics.find((x) => x.id === g.def.main);
  if (!m) return null;
  const byYear = new Map<number, number>();
  for (const r of g.all) byYear.set(r.year, (byYear.get(r.year) ?? 0) + (m.get(r.stats) ?? 0));
  const values = [...byYear].map(([year, v]) => ({ year, v }));
  const year = peakSeason(values);
  return year == null ? null : { year, value: byYear.get(year)! };
}

export interface PeakRow { title: string; kind: StatKind; a: Peak | null; b: Peak | null; win: Win }

export function peakRow(groupId: string, a: Side, b: Side): PeakRow | null {
  const ga = a.groups.find((g) => g.def.id === groupId), gb = b.groups.find((g) => g.def.id === groupId);
  if (!ga || !gb) return null;
  const m = metricOf(ga.def, ga.def.main);
  const x = peakOf(ga), y = peakOf(gb);
  return { title: m.title, kind: m.kind, a: x, b: y, win: winner(x?.value ?? null, y?.value ?? null) };
}

// ---- the radar ----------------------------------------------------------------------------------------------------------------------------

export interface RadarPair { ref: string; label: string; low: boolean; a: { value: number; pct: number }; b: { value: number; pct: number } }

/** The axes both players have a place on among their league's players (api.stat_reference). Empty while either has played too little in the group or the league figures are missing. */
export function radarPairs(groupId: string, a: Side, b: Side): RadarPair[] {
  const ga = a.groups.find((g) => g.def.id === groupId), gb = b.groups.find((g) => g.def.id === groupId);
  if (!ga || !gb || !a.refs.size || !b.refs.size) return [];
  const phase = phaseOf(ga);
  if (!enoughPlayed(groupId, phase, ga.total) || !enoughPlayed(groupId, phase, gb.total)) return [];
  const pb = new Map(radarOf(GROUPS[groupId], gb.rows, b.refs, phase).map((p) => [p.ref, p]));
  return radarOf(GROUPS[groupId], ga.rows, a.refs, phase).flatMap((p) => {
    const q = pb.get(p.ref);
    return p.pct != null && p.value != null && q?.pct != null && q.value != null ? [{ ref: p.ref, label: p.label, low: p.low, a: { value: p.value, pct: p.pct }, b: { value: q.value, pct: q.pct } }] : [];
  });
}

// ---- the picker's choices -----------------------------------------------------------------------------------------------------------------

/** The decades the era menu offers, newest first. */
export function decades(now: number): number[] {
  const out: number[] = [];
  for (let d = Math.floor(now / 10) * 10; d >= 1900; d -= 10) out.push(d);
  return out;
}

/** The query of the players list for the picker's choices; null when nothing is chosen (a list of everyone is not a choice). */
export function pickerQuery(o: { q: string; league: string; position: string; decade: number | null }): string | null {
  const text = o.q.trim(), position = o.league ? o.position : "";
  if (!text && !o.league && !position && o.decade == null) return null;
  const p = new URLSearchParams();
  if (text) p.set("q", text);
  if (o.league) p.set("league", o.league);
  if (position) p.set("position", position);
  if (o.decade != null) { p.set("from", String(o.decade)); p.set("to", String(o.decade + 9)); }
  p.set("sort", "seasons.desc,awards.desc");
  p.set("limit", "10");
  p.set("fields", "name,position,positions,leagues,first_season,last_season");
  return p.toString();
}

/** The person id the address's `vs` names, else null. */
export function vsFromSearch(search: string): number | null {
  const v = new URLSearchParams(search).get("vs");
  return v !== null && /^[1-9]\d{0,9}$/.test(v) ? Number(v) : null;
}
