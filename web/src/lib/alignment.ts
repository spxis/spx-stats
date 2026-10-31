/**
 * League alignment: which conference and division a club sat in, season by season (db/migrations/028_api_alignment.sql).
 * Pure and shared by the server pages and the client components: row shapes (their Zod schemas are in alignmentSchema.ts), the standings views
 * (?view=league|conference|division|wildcard), how a season's standings are grouped for each, and how a club's
 * seasons fold into runs.
 */
import type { Speaker } from "@/lib/i18n/i18n";

type Say = Speaker["say"];

/* ---------- api.alignment, api.alignment_changes ----------------------------------------------------- */

export interface AlignmentRow {
  league: string;
  year: number;
  conference: string | null;
  division: string | null;
  franchise_id: number;
  team: string | null;
  conference_short: string | null;
  division_short: string | null;
  team_id: number;
}


export interface AlignmentChangeRow {
  league: string;
  year: number;
  franchise_id: number;
  team: string | null;
  from_conference: string | null;
  from_division: string | null;
  to_conference: string | null;
  to_division: string | null;
  from_year: number | null;
  from_conference_short: string | null;
  from_division_short: string | null;
  to_conference_short: string | null;
  to_division_short: string | null;
}


/* ---------- the standings views ---------------------------------------------------------------------- */

export const VIEW_IDS = ["league", "conference", "division", "wildcard"] as const;
export type ViewId = (typeof VIEW_IDS)[number];


export interface Placed {
  conference?: string | null;
  conference_short?: string | null;
  division?: string | null;
  division_short?: string | null;
}

/** The subset of a standings row the grouping reads. */
export interface Ranked extends Placed {
  team: string | null;
  pts: number | null;
  w: number | null;
  pf: number | null;
  pa: number | null;
  pct: number | null;
}

/** The NHL's wild-card format: three clubs a division, then two wild cards a conference (2013-14 on; 2020-21 was divisions only). */
export const hasWildCard = (lg: string, year: number): boolean => lg === "nhl" && year >= 2013 && year !== 2020;

const kinds = (rows: readonly Placed[]) => ({
  conferences: new Set(rows.map((r) => r.conference).filter(Boolean)),
  divisions: new Set(rows.filter((r) => r.division).map((r) => `${r.conference ?? ""}|${r.division}`)),
});

/** The views a season can show: the whole league always; the others only when the season had that level. */
export function availableViews(lg: string, year: number, rows: readonly Placed[]): ViewId[] {
  const k = kinds(rows);
  const out: ViewId[] = ["league"];
  if (k.conferences.size >= 2) out.push("conference");
  if (k.divisions.size >= 2) out.push("division");
  if (hasWildCard(lg, year) && k.conferences.size >= 2 && k.divisions.size >= 2) out.push("wildcard");
  return out;
}

/** What a view is called on its button. MLB's conferences are its leagues and the CFL's are East and West, and say so. */
export function viewLabel(say: Say, lg: string, view: ViewId, rows: readonly Placed[]): string {
  if (view === "league") return say("view.league");
  if (view === "division") return say("view.division");
  if (view === "wildcard") return say("view.wildcard");
  if (lg === "mlb" || lg === "cfl") {
    const shorts = [...new Set(rows.map((r) => r.conference_short).filter((s): s is string => !!s))].sort();
    if (shorts.length >= 2 && shorts.length <= 3) return shorts.join(" / ");
  }
  return say("view.conference");
}

export interface Group { id: string; title: string; sub?: string }

const cmp = (a: string, b: string) => a.localeCompare(b, "en");
export const byRank = (a: Ranked, b: Ranked) =>
  (b.pts ?? -1) - (a.pts ?? -1) || (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0) ||
  (b.pf ?? 0) - (b.pa ?? 0) - ((a.pf ?? 0) - (a.pa ?? 0)) || cmp(a.team ?? "", b.team ?? "");

/**
 * The groups of a view, in the order they are drawn, and the group each row falls in (by index into `rows`).
 * A club the season gives no place to (a source that had no alignment for it) is gathered last under "Not placed".
 */
export function groupStandings<T extends Ranked>(say: Say, rows: readonly T[], view: ViewId, leagueName = ""): { groups: Group[]; of: string[] } {
  if (view === "league") return { groups: [{ id: "all", title: leagueName }], of: rows.map(() => "all") };
  const confName = (r: Placed) => r.conference ?? "";
  const divKey = (r: Placed) => `${confName(r)}|${r.division ?? ""}`;
  const groups = new Map<string, Group>();
  const add = (g: Group) => { if (!groups.has(g.id)) groups.set(g.id, g); };
  const of: string[] = new Array(rows.length);
  const unplaced = new Set<string>();

  if (view === "wildcard") {
    // within each conference: the top three of each division, then the best two of the rest, then the rest
    const byConf = new Map<string, number[]>();
    rows.forEach((r, i) => byConf.set(confName(r), [...(byConf.get(confName(r)) ?? []), i]));
    for (const c of [...byConf.keys()].sort(cmp)) {
      const idx = byConf.get(c)!;
      const taken = new Set<number>();
      const divs = [...new Set(idx.map((i) => rows[i].division ?? ""))].sort(cmp);
      for (const d of divs) {
        const leaders = idx.filter((i) => (rows[i].division ?? "") === d).sort((a, b) => byRank(rows[a], rows[b])).slice(0, 3);
        const id = `wc|${c}|${d}`;
        if (!d) unplaced.add(id);
        add({ id, title: d || say("group.notPlaced"), sub: say("group.topThree", { conference: c || say("view.league") }) });
        for (const i of leaders) { of[i] = id; taken.add(i); }
      }
      const rest = idx.filter((i) => !taken.has(i)).sort((a, b) => byRank(rows[a], rows[b]));
      const cardId = `wc|${c}|~card`, outId = `wc|${c}|~out`;
      add({ id: cardId, title: say("group.wildCard"), sub: c || say("view.league") });
      add({ id: outId, title: say("group.outside"), sub: c || say("view.league") });
      rest.forEach((i, n) => { of[i] = n < 2 ? cardId : outId; });
    }
    return { groups: [...groups.values()].filter((g) => of.includes(g.id)), of };
  }

  const keys = rows.map((r) => (view === "conference" ? confName(r) : divKey(r)));
  const order = new Map<string, Group>();
  rows.forEach((r, i) => {
    const k = keys[i];
    of[i] = k || "~none";
    if (order.has(of[i])) return;
    if (!k || (view === "division" && !r.division) || (view === "conference" && !r.conference)) { unplaced.add(of[i]); order.set(of[i], { id: of[i], title: say("group.notPlaced") }); }
    else if (view === "conference") order.set(k, { id: k, title: r.conference as string });
    else order.set(k, { id: k, title: r.division as string, sub: r.conference ?? undefined });
  });
  const sorted = [...order.values()].sort((a, b) => {
    const na = unplaced.has(a.id), nb = unplaced.has(b.id);
    if (na || nb) return na === nb ? 0 : na ? 1 : -1;
    return cmp(a.sub ?? "", b.sub ?? "") || cmp(a.title, b.title);
  });
  return { groups: sorted, of };
}

/* ---------- a club's places, folded into runs -------------------------------------------------------- */

export interface Run {
  from: number;
  to: number;
  conference: string | null;
  division: string | null;
}

/** A club's seasons folded into runs of consecutive seasons spent in one conference and division (a gap in the data starts a new run). */
export function runsOf(rows: readonly Pick<AlignmentRow, "year" | "conference" | "division">[], seasons: readonly number[]): Run[] {
  const idx = new Map(seasons.map((y, i) => [y, i]));
  const out: Run[] = [];
  for (const r of [...rows].sort((a, b) => a.year - b.year)) {
    const last = out.at(-1);
    const contiguous = last && (idx.get(r.year) ?? -9) - (idx.get(last.to) ?? -99) === 1;
    if (last && contiguous && last.conference === r.conference && last.division === r.division) last.to = r.year;
    else out.push({ from: r.year, to: r.year, conference: r.conference, division: r.division });
  }
  return out;
}

/* ---------- the timeline ----------------------------------------------------------------------------- */

export interface Lane {
  /** The conference and division name, `|`-joined: one lane per division (or per conference when a season has no divisions). */
  key: string;
  conference: string | null;
  division: string | null;
  short: string;
  /** Unbroken stretches of seasons and the number of clubs in each season. */
  spans: { from: number; to: number }[];
  counts: Map<number, number>;
}

/**
 * One lane per conference-and-division, with the stretches of seasons it existed in. A conference that has divisions
 * in some seasons and not in others gets a lane of its own for the seasons without. Lanes run top to bottom by
 * conference (in the order they first appeared) and, inside it, by the year the lane began.
 */
export function lanesOf(rows: readonly AlignmentRow[], seasons: readonly number[]): Lane[] {
  const idx = new Map(seasons.map((y, i) => [y, i]));
  const m = new Map<string, Lane>();
  for (const r of rows) {
    if (!r.conference && !r.division) continue;
    const key = `${r.conference ?? ""}|${r.division ?? ""}`;
    let lane = m.get(key);
    if (!lane) {
      lane = { key, conference: r.conference, division: r.division, short: r.division_short ?? r.conference_short ?? "", spans: [], counts: new Map() };
      m.set(key, lane);
    }
    lane.counts.set(r.year, (lane.counts.get(r.year) ?? 0) + 1);
  }
  for (const lane of m.values()) {
    for (const y of [...lane.counts.keys()].sort((a, b) => a - b)) {
      const s = lane.spans.at(-1);
      if (s && (idx.get(y) ?? -9) - (idx.get(s.to) ?? -99) === 1) s.to = y; else lane.spans.push({ from: y, to: y });
    }
  }
  const firstOf = (l: Lane) => l.spans[0].from;
  const confFirst = new Map<string, number>();
  for (const l of m.values()) confFirst.set(l.conference ?? "", Math.min(confFirst.get(l.conference ?? "") ?? 9999, firstOf(l)));
  return [...m.values()].sort((a, b) =>
    (confFirst.get(a.conference ?? "") ?? 0) - (confFirst.get(b.conference ?? "") ?? 0) ||
    cmp(a.conference ?? "", b.conference ?? "") || firstOf(a) - firstOf(b) || cmp(a.division ?? "", b.division ?? ""));
}

/** Words for a move: "Northeast → Atlantic", or the conference too when that changed. */
export function moveText(say: Say, c: AlignmentChangeRow): string {
  const from = [c.from_conference_short, c.from_division_short].filter(Boolean).join(" ");
  const to = [c.to_conference_short, c.to_division_short].filter(Boolean).join(" ");
  if (!from) return say("align.joined", { to });
  const sameConf = c.from_conference === c.to_conference;
  return sameConf && c.from_division && c.to_division ? `${c.from_division_short} → ${c.to_division_short}` : `${from} → ${to}`;
}
