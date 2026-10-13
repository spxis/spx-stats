import type { SeasonCoachRow, SeasonRosterRow, StandingRow, TeamIdentityRow } from "./api/types.ts";

/*
 * The "before and after" of a season that was not played: the last season before the gap set against the first after it.
 * Pure functions over rows the page has already read, so they can be tested without a database.
 */

/** How strong a club was: its share of the points on offer where the league awards points (2 a win), else its winning share. */
export function strengthOf(r: Pick<StandingRow, "gp" | "pts" | "pct">): number | null {
  if (r.pts != null && r.gp) return r.pts / (2 * r.gp);
  return r.pct ?? null;
}

/** True when the league awards points, so strength is a points share and the page says so. */
export const usesPoints = (rows: readonly Pick<StandingRow, "gp" | "pts" | "pct">[]): boolean => rows.some((r) => r.pts != null && !!r.gp);

export interface Club {
  f: number;
  teamId: number;
  name: string;
  gp: number | null;
  w: number | null;
  l: number | null;
  t: number | null;
  otl: number | null;
  pts: number | null;
  pf: number | null;
  pa: number | null;
  strength: number | null;
  rank: number;
}

/** The clubs of one season, best first (strength, then wins), each with its place in the league. A club with no games is left out. */
export function rankClubs(rows: readonly StandingRow[]): Club[] {
  const played = rows.filter((r) => (r.gp ?? 0) > 0);
  const out = played.map((r): Club => ({
    f: r.franchise_id, teamId: r.team_id, name: r.team ?? "", gp: r.gp, w: r.w, l: r.l, t: r.t, otl: r.otl, pts: r.pts, pf: r.pf, pa: r.pa,
    strength: strengthOf(r), rank: 0,
  }));
  out.sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1) || (b.w ?? 0) - (a.w ?? 0) || a.name.localeCompare(b.name));
  out.forEach((c, i) => { c.rank = i + 1; });
  return out;
}

export interface Line {
  f: number;
  before: Club | null;
  after: Club | null;
  /** Strength after minus strength before; null when the club is on only one side. */
  change: number | null;
  /** Places climbed (positive) or lost (negative) in the league table. */
  places: number | null;
}

/** Every club on either side of the gap, joined by franchise. */
export function lineUp(before: readonly Club[], after: readonly Club[]): Line[] {
  const b = new Map(before.map((c) => [c.f, c]));
  const a = new Map(after.map((c) => [c.f, c]));
  const out: Line[] = [];
  for (const f of new Set([...b.keys(), ...a.keys()])) {
    const x = b.get(f) ?? null, y = a.get(f) ?? null;
    const both = x && y && x.strength != null && y.strength != null;
    out.push({ f, before: x, after: y, change: both ? y.strength! - x.strength! : null, places: x && y ? x.rank - y.rank : null });
  }
  return out;
}

/** The clubs that gained or lost the most strength across the gap, `n` of each (only clubs on both sides, and only real moves). */
export function movers(lines: readonly Line[], n = 3): { risers: Line[]; fallers: Line[] } {
  const both = lines.filter((l) => l.change != null);
  const sorted = [...both].sort((a, b) => b.change! - a.change!);
  return {
    risers: sorted.filter((l) => l.change! > 0).slice(0, n),
    fallers: sorted.filter((l) => l.change! < 0).reverse().slice(0, n),
  };
}

export interface Figures {
  clubs: number;
  /** Goals (points, runs) scored per game by both sides together; null when the standings carry no scores. */
  scoring: number | null;
  best: Club | null;
  worst: Club | null;
  /** Best strength minus worst: how far apart the league's clubs were. */
  spread: number | null;
}

export function figuresOf(clubs: readonly Club[]): Figures {
  const withScore = clubs.filter((c) => c.pf != null && c.gp);
  const games = withScore.reduce((s, c) => s + (c.gp ?? 0), 0) / 2;
  const scored = withScore.reduce((s, c) => s + (c.pf ?? 0), 0);
  const rated = clubs.filter((c) => c.strength != null);
  const best = rated[0] ?? null, worst = rated[rated.length - 1] ?? null;
  return {
    clubs: clubs.length,
    scoring: games > 0 ? scored / games : null,
    best, worst,
    spread: best && worst && best.strength != null && worst.strength != null ? best.strength - worst.strength : null,
  };
}

/* ---------- who the clubs were ---------- */

export type ChangeKind = "joined" | "left" | "moved" | "renamed";
export interface FranchiseChange {
  kind: ChangeKind;
  f: number;
  /** The name before (absent for a club that joined) and after (absent for a club that left). */
  from: string | null;
  to: string | null;
}

/**
 * The clubs that joined, left, moved city or took a new name between the two seasons. A club is the same one while it keeps its
 * franchise; a changed city is a move, a changed nickname alone a rename (the club's full team name stands in where the archive has
 * no city and nickname for it).
 */
export function franchiseChanges(before: readonly Club[], after: readonly Club[], idBefore: readonly TeamIdentityRow[], idAfter: readonly TeamIdentityRow[]): FranchiseChange[] {
  const ib = new Map(idBefore.map((i) => [i.franchise_id, i]));
  const ia = new Map(idAfter.map((i) => [i.franchise_id, i]));
  const a = new Map(after.map((c) => [c.f, c]));
  const b = new Map(before.map((c) => [c.f, c]));
  const out: FranchiseChange[] = [];
  for (const c of before) {
    const y = a.get(c.f);
    if (!y) { out.push({ kind: "left", f: c.f, from: c.name, to: null }); continue; }
    const x = ib.get(c.f), z = ia.get(c.f);
    if (x?.location && z?.location && x.location !== z.location) out.push({ kind: "moved", f: c.f, from: c.name, to: y.name });
    else if ((x?.nickname && z?.nickname ? x.nickname !== z.nickname : c.name !== y.name)) out.push({ kind: "renamed", f: c.f, from: c.name, to: y.name });
  }
  for (const c of after) if (!b.has(c.f)) out.push({ kind: "joined", f: c.f, from: null, to: c.name });
  const order: Record<ChangeKind, number> = { moved: 0, renamed: 1, joined: 2, left: 3 };
  return out.sort((x, y) => order[x.kind] - order[y.kind] || (x.to ?? x.from ?? "").localeCompare(y.to ?? y.from ?? ""));
}

/* ---------- head coaches ---------- */

export interface CoachMove {
  f: number;
  before: { id: number; name: string } | null;
  after: { id: number; name: string } | null;
  /** True when the club began the later season under a different head coach; null when either season has no coach on file. */
  changed: boolean | null;
}

/** A club's head coach at the end of a season: the last of its head coaches. */
function finalCoach(rows: readonly SeasonCoachRow[]): Map<number, { id: number; name: string }> {
  const out = new Map<number, { id: number; name: string }>();
  for (const r of [...rows].sort((a, b) => a.ord - b.ord)) out.set(r.franchise_id, { id: r.person_id, name: r.name });
  return out;
}

export function coachMoves(clubs: readonly number[], before: readonly SeasonCoachRow[], after: readonly SeasonCoachRow[]): CoachMove[] {
  const b = finalCoach(before), a = finalCoach(after);
  return clubs.map((f) => {
    const x = b.get(f) ?? null, y = a.get(f) ?? null;
    return { f, before: x, after: y, changed: x && y ? x.id !== y.id : null };
  });
}

/* ---------- rosters ---------- */

export interface Person {
  id: number;
  name: string;
  /** Games played for the club (or, in a league-wide list, in the season). */
  gp: number;
  seasons: number;
  first: number | null;
  last: number | null;
  position: string | null;
}

export interface Carry {
  f: number;
  stayed: Person[];
  /** On the club before, with another club after. */
  traded: Person[];
  /** On the club before, in no club's roster after. */
  gone: Person[];
  /** On the club after, with another club before. */
  fromElsewhere: Person[];
  /** On the club after, on no roster before. */
  fresh: Person[];
  /** Share of the club's later-season games played by players who were with it before; null when the later season has no games on file. */
  continuity: number | null;
  sizeBefore: number;
  sizeAfter: number;
}

function personOf(r: SeasonRosterRow, gp: number): Person {
  return { id: r.person_id, name: r.name, gp, seasons: r.seasons_played, first: r.first_season, last: r.last_season, position: r.position };
}

/** Each player once per club (a player who moved in the season has a row for each club), with games summed. */
function perClub(rows: readonly SeasonRosterRow[]): Map<number, Map<number, Person>> {
  const out = new Map<number, Map<number, Person>>();
  for (const r of rows) {
    const club = out.get(r.franchise_id) ?? new Map<number, Person>();
    const have = club.get(r.person_id);
    if (have) have.gp += r.games_played ?? 0;
    else club.set(r.person_id, personOf(r, r.games_played ?? 0));
    out.set(r.franchise_id, club);
  }
  return out;
}

const byGames = (a: Person, b: Person) => b.gp - a.gp || b.seasons - a.seasons || a.name.localeCompare(b.name);

/** Who stayed, left and arrived at each club across the gap. Clubs missing from either side's roster get no row. */
export function carryOver(before: readonly SeasonRosterRow[], after: readonly SeasonRosterRow[]): Carry[] {
  const b = perClub(before), a = perClub(after);
  const everyoneBefore = new Set(before.map((r) => r.person_id));
  const everyoneAfter = new Set(after.map((r) => r.person_id));
  const out: Carry[] = [];
  for (const [f, mine] of b) {
    const next = a.get(f);
    if (!next) continue;
    const c: Carry = { f, stayed: [], traded: [], gone: [], fromElsewhere: [], fresh: [], continuity: null, sizeBefore: mine.size, sizeAfter: next.size };
    for (const [id, p] of mine) {
      if (next.has(id)) c.stayed.push(next.get(id)!);
      else if (everyoneAfter.has(id)) c.traded.push(p);
      else c.gone.push(p);
    }
    for (const [id, p] of next) {
      if (mine.has(id)) continue;
      if (everyoneBefore.has(id)) c.fromElsewhere.push(p);
      else c.fresh.push(p);
    }
    const total = [...next.values()].reduce((s, p) => s + p.gp, 0);
    const kept = c.stayed.reduce((s, p) => s + p.gp, 0);
    c.continuity = total > 0 ? kept / total : null;
    for (const k of ["stayed", "traded", "gone", "fromElsewhere", "fresh"] as const) c[k].sort(byGames);
    out.push(c);
  }
  return out;
}

/** The players on both rosters' league-wide lists: one entry per person with games summed over their clubs. */
function perPerson(rows: readonly SeasonRosterRow[]): Map<number, Person & { clubs: Map<number, number> }> {
  const out = new Map<number, Person & { clubs: Map<number, number> }>();
  for (const r of rows) {
    const gp = r.games_played ?? 0;
    const p = out.get(r.person_id) ?? { ...personOf(r, 0), clubs: new Map<number, number>() };
    p.gp += gp;
    p.clubs.set(r.franchise_id, (p.clubs.get(r.franchise_id) ?? 0) + gp);
    out.set(r.person_id, p);
  }
  return out;
}

const byCareer = (a: Person, b: Person) => b.seasons - a.seasons || b.gp - a.gp || a.name.localeCompare(b.name);

/** A player and the franchise they played most games for in the season in question. */
export type Placed = Person & { club: number };

export interface Crossing {
  /** On a roster in both seasons. */
  both: number;
  /** Players whose last season in the league was the one before the gap. */
  ended: Placed[];
  /** Players whose first season in the league was the one after the gap. */
  debuts: Placed[];
  /** On a roster in both seasons but with a different main club. */
  moved: (Person & { from: number; to: number })[];
  playersBefore: number;
  playersAfter: number;
}

/** League-wide: who was on both sides of the gap, whose career ended with it, who began after it, who changed clubs. */
export function crossing(before: readonly SeasonRosterRow[], after: readonly SeasonRosterRow[], yearBefore: number, yearAfter: number): Crossing {
  const b = perPerson(before), a = perPerson(after);
  const main = (clubs: Map<number, number>) => [...clubs].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? 0;
  const moved: Crossing["moved"] = [];
  let both = 0;
  for (const [id, p] of b) {
    const q = a.get(id);
    if (!q) continue;
    both++;
    const from = main(p.clubs), to = main(q.clubs);
    if (from !== to) moved.push({ ...q, gp: q.gp, from, to });
  }
  return {
    both,
    ended: [...b.values()].filter((p) => p.last === yearBefore).map((p) => ({ ...p, club: main(p.clubs) })).sort(byCareer),
    debuts: [...a.values()].filter((p) => p.first === yearAfter).map((p) => ({ ...p, club: main(p.clubs) })).sort(byCareer),
    moved: moved.sort(byCareer),
    playersBefore: b.size,
    playersAfter: a.size,
  };
}
