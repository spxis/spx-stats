/**
 * How head coaches moved between clubs, as the blocks and bands of a Sankey diagram: the pure part (no Next imports, so a node script can
 * test it). A coach's career is a list of stints, each an unbroken run of seasons with one franchise (the archive's api.team_season_staff,
 * role head_coach; baseball managers are head coaches here). A move is one stint followed by a stint with another franchise. In the
 * diagram a block is a franchise at the nth job of the coaches who pass through it, and a band is one coach going from one block to the next.
 */

/** One row of the archive: a head coach of a franchise in a season. */
export interface StaffRow {
  person_id: number;
  name: string;
  franchise_id: number;
  year: number;
  first_on: string | null;
}

export interface Rec { w: number; l: number; t: number; otl: number }

/** A club's results of a season, by `${franchise}:${year}` (api.team_seasons). */
export type Results = ReadonlyMap<string, Rec>;

export interface Stint {
  f: number;
  /** First and last season of the run (a season is named for the year it starts). */
  a: number;
  b: number;
  /** Seasons in the run in which he was a head coach of the club (a year can be missing inside the run). */
  n: number;
  /** The club's name in the last season of the run (an index into the league's table of names). */
  s: number;
  /** The club's record over the seasons he was its only head coach. */
  rec: Rec;
  /** How many of the `n` seasons those are. */
  sole: number;
}

export interface Career {
  id: number;
  name: string;
  /** Where his page is, or null when he has none (a coach who never played). */
  href: string | null;
  stints: Stint[];
}

const ZERO: Rec = { w: 0, l: 0, t: 0, otl: 0 };
const add = (x: Rec, y: Rec): Rec => ({ w: x.w + y.w, l: x.l + y.l, t: x.t + y.t, otl: x.otl + y.otl });

/**
 * The careers of every coach who held the job with two or more franchises, from every head coach row of a league. `nameIndex` says which
 * entry of the league's table of club names a franchise had in a season. A season two coaches shared adds no record (the table's
 * record is the club's, not one coach's).
 */
export function buildCareers(rows: readonly StaffRow[], results: Results, nameIndex: (f: number, year: number) => number, hrefOf: (id: number, name: string) => string | null): Career[] {
  const perSeason = new Map<string, Set<number>>();
  for (const r of rows) {
    const k = `${r.franchise_id}:${r.year}`;
    const set = perSeason.get(k);
    if (set) set.add(r.person_id); else perSeason.set(k, new Set([r.person_id]));
  }
  const by = new Map<number, StaffRow[]>();
  for (const r of rows) {
    const list = by.get(r.person_id);
    if (list) list.push(r); else by.set(r.person_id, [r]);
  }
  const careers: Career[] = [];
  for (const [id, list] of by) {
    if (new Set(list.map((r) => r.franchise_id)).size < 2) continue;
    list.sort((x, y) => x.year - y.year || (x.first_on ?? "9999").localeCompare(y.first_on ?? "9999"));
    const stints: Stint[] = [];
    const seen = new Set<string>();
    for (const r of list) {
      const key = `${r.franchise_id}:${r.year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const solo = perSeason.get(key)?.size === 1 ? results.get(key) : undefined;
      const last = stints.at(-1);
      if (last && last.f === r.franchise_id) {
        last.b = r.year;
        last.n++;
        last.s = nameIndex(r.franchise_id, r.year);
        if (solo) { last.rec = add(last.rec, solo); last.sole++; }
      } else {
        stints.push({ f: r.franchise_id, a: r.year, b: r.year, n: 1, s: nameIndex(r.franchise_id, r.year), rec: solo ? { ...solo } : { ...ZERO }, sole: solo ? 1 : 0 });
      }
    }
    careers.push({ id, name: list[0].name, href: hrefOf(id, list[0].name), stints });
  }
  return careers.sort((x, y) => x.stints[0].a - y.stints[0].a || x.id - y.id);
}

/** The decades (the year each starts in) in which a coach took a job with a different franchise from his last, oldest first. */
export function decadesOf(careers: readonly Career[]): number[] {
  const out = new Set<number>();
  for (const c of careers) for (let k = 1; k < c.stints.length; k++) out.add(Math.floor(c.stints[k].a / 10) * 10);
  return [...out].sort((a, b) => a - b);
}

/** How many moves were made, by decade. */
export function movesByDecade(careers: readonly Career[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of careers) for (let k = 1; k < c.stints.length; k++) { const d = Math.floor(c.stints[k].a / 10) * 10; out.set(d, (out.get(d) ?? 0) + 1); }
  return out;
}

/** The decade the page opens on: the latest with at least `least` moves, else the latest with any; null when nobody moved. */
export function defaultDecade(careers: readonly Career[], least = 8): number | null {
  const by = [...movesByDecade(careers)].sort((a, b) => b[0] - a[0]);
  return (by.find(([, n]) => n >= least) ?? by[0])?.[0] ?? null;
}

/** A coach's run through a stretch of his career: the stints he held, the first being the job he left. */
export interface Chain {
  id: string;
  career: Career;
  stints: Stint[];
}

/**
 * The runs to draw. With no decade, each career whole. With a decade, each run of consecutive moves that each began in it, with the job
 * the first of them left: a coach who moved in two separate decades makes a run in each.
 */
export function chainsFor(careers: readonly Career[], decade: number | null): Chain[] {
  const out: Chain[] = [];
  for (const c of careers) {
    if (decade == null) { out.push({ id: String(c.id), career: c, stints: c.stints }); continue; }
    let start = -1, n = 0;
    const flush = (end: number) => { if (start >= 0) out.push({ id: `${c.id}-${n++}`, career: c, stints: c.stints.slice(start, end + 1) }); start = -1; };
    for (let k = 1; k < c.stints.length; k++) {
      const inDecade = c.stints[k].a >= decade && c.stints[k].a < decade + 10;
      if (inDecade) { if (start < 0) start = k - 1; } else flush(k - 1);
    }
    flush(c.stints.length - 1);
  }
  return out;
}

export interface CoachNode {
  id: string;
  column: number;
  order: number;
  f: number;
  /** The coaches who held their nth job here, each with the stint. */
  held: { chain: Chain; stint: Stint; k: number }[];
}

export interface CoachLink {
  id: string;
  source: string;
  target: string;
  chain: Chain;
  /** The index of the stint the band leaves (it enters the next). */
  k: number;
}

export interface CoachGraph {
  nodes: CoachNode[];
  links: CoachLink[];
  routes: { nodes: string[]; links: string[] }[];
  columns: number;
}

export const coachNodeId = (column: number, f: number) => `c${column}-${f}`;

/** Blocks and bands of the chains, with the blocks of each column ordered to keep the bands from crossing more than they must. */
export function coachGraph(chains: readonly Chain[], clubName: (f: number, s: number) => string = (f) => String(f)): CoachGraph {
  const nodes = new Map<string, CoachNode>();
  const links: CoachLink[] = [];
  const routes: CoachGraph["routes"] = [];
  let columns = 0;
  for (const chain of chains) {
    if (chain.stints.length < 2) continue;
    columns = Math.max(columns, chain.stints.length);
    const route = { nodes: [] as string[], links: [] as string[] };
    chain.stints.forEach((stint, k) => {
      const id = coachNodeId(k, stint.f);
      let node = nodes.get(id);
      if (!node) nodes.set(id, node = { id, column: k, order: 0, f: stint.f, held: [] });
      node.held.push({ chain, stint, k });
      route.nodes.push(id);
      if (k) {
        const link: CoachLink = { id: `l${chain.id}-${k - 1}`, source: coachNodeId(k - 1, chain.stints[k - 1].f), target: id, chain, k: k - 1 };
        links.push(link);
        route.links.push(link.id);
      }
    });
    routes.push(route);
  }
  // Start from the names, then pull each block towards the middle of the blocks it is joined to, forwards and back.
  const list = [...nodes.values()];
  const byColumn = Array.from({ length: columns }, (_, c) => list.filter((n) => n.column === c));
  const label = (n: CoachNode) => clubName(n.f, n.held.at(-1)!.stint.s);
  for (const col of byColumn) { col.sort((x, y) => label(x).localeCompare(label(y)) || x.f - y.f); col.forEach((n, i) => { n.order = i; }); }
  const neighbours = (n: CoachNode, dir: -1 | 1) => links.filter((l) => (dir < 0 ? l.target : l.source) === n.id).map((l) => nodes.get(dir < 0 ? l.source : l.target)!);
  const pull = (c: number, dir: -1 | 1) => {
    const col = byColumn[c];
    const centre = new Map(col.map((n) => {
      const near = neighbours(n, dir);
      return [n.id, near.length ? near.reduce((s, m) => s + m.order, 0) / near.length : n.order] as const;
    }));
    col.sort((x, y) => centre.get(x.id)! - centre.get(y.id)! || x.order - y.order);
    col.forEach((n, i) => { n.order = i; });
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let c = 1; c < columns; c++) pull(c, -1);
    for (let c = columns - 2; c >= 0; c--) pull(c, 1);
  }
  return { nodes: list, links, routes, columns };
}
