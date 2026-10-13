/**
 * Where every franchise came from, through time: the pure part (no Next imports, so a node script can test it).
 *
 * A franchise is read as a chain of stretches, each an unbroken run of seasons under one name (api.team_season_index gives the
 * name a club played each season under). A new name (a rename or a move; the archive does not say which) starts the next stretch.
 * The chain starts at the season the franchise first appears in the league, and franchises that began in the same season share an
 * "entry" node: that is where a league merger shows (the WHA clubs in the NHL in 1979, the ABA clubs in the NBA in 1976).
 */

export interface SeasonRow {
  league: string;
  year: number;
  franchise_id: number;
  team: string | null;
  w: number | null;
  l: number | null;
  t: number | null;
  otl: number | null;
  champion: boolean | null;
}

export interface IndexRow {
  league: string;
  franchise_id: number;
  first_season: number | null;
  last_season: number | null;
  seasons: number;
  titles: number;
  active: boolean;
}

export interface Stretch {
  name: string;
  from: number;
  to: number;
  /** Seasons held in the archive under this name. */
  seasons: number;
  titles: number;
  w: number;
  l: number;
  t: number;
  otl: number;
}

export interface Franchise {
  league: string;
  f: number;
  /** The address of the team's page, made by the server (the slugs live there). */
  href: string;
  stretches: Stretch[];
  first: number;
  last: number;
  active: boolean;
  seasons: number;
  titles: number;
}

/** A name the way a search compares it: no accents, case, dots or apostrophes ("B.C. Lions" and "BC Lions" are one name). */
export function foldName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The franchises of the league index with their stretches. A franchise with no season in the archive is left out. */
export function buildFranchises(seasons: SeasonRow[], index: IndexRow[], hrefOf: (league: string, f: number) => string): Franchise[] {
  const by = new Map<string, SeasonRow[]>();
  for (const r of seasons) {
    if (r.team == null) continue;
    const k = `${r.league}|${r.franchise_id}`;
    const list = by.get(k);
    if (list) list.push(r); else by.set(k, [r]);
  }
  const out: Franchise[] = [];
  for (const ix of index) {
    if (ix.first_season == null || ix.last_season == null || ix.seasons <= 0) continue;
    const mine = (by.get(`${ix.league}|${ix.franchise_id}`) ?? [])
      .filter((r) => r.year >= ix.first_season! && r.year <= ix.last_season!)
      .sort((a, b) => a.year - b.year);
    if (!mine.length) continue;
    const stretches: Stretch[] = [];
    let key = "";
    for (const r of mine) {
      const k = foldName(r.team!);
      let s = stretches.at(-1);
      if (!s || k !== key) {
        s = { name: r.team!, from: r.year, to: r.year, seasons: 0, titles: 0, w: 0, l: 0, t: 0, otl: 0 };
        stretches.push(s);
        key = k;
      }
      s.name = r.team!;
      s.to = r.year;
      s.seasons += 1;
      s.titles += r.champion ? 1 : 0;
      s.w += r.w ?? 0; s.l += r.l ?? 0; s.t += r.t ?? 0; s.otl += r.otl ?? 0;
    }
    out.push({
      league: ix.league, f: ix.franchise_id, href: hrefOf(ix.league, ix.franchise_id), stretches,
      first: ix.first_season, last: ix.last_season, active: ix.active, seasons: ix.seasons, titles: ix.titles,
    });
  }
  return out;
}

/** The decades (their first years) some franchise of the league was active in, oldest first. */
export function decadesOf(fs: Franchise[]): number[] {
  if (!fs.length) return [];
  const lo = Math.min(...fs.map((f) => f.first)), hi = Math.max(...fs.map((f) => f.last));
  const out: number[] = [];
  for (let d = Math.floor(lo / 10) * 10; d <= hi; d += 10) out.push(d);
  return out;
}

export interface LineageFilter {
  /** First year of a decade; the franchises that existed at some point in it. Null for every franchise. */
  decade: number | null;
  /** Only the franchises that changed name at least once. */
  changed: boolean;
}

export function pickFranchises(fs: Franchise[], o: LineageFilter): Franchise[] {
  return fs.filter((f) => (o.decade == null || (f.first <= o.decade + 9 && f.last >= o.decade)) && (!o.changed || f.stretches.length > 1));
}

/** League mergers the ticket names: the year the clubs of the other league joined. The archive holds none of the other league's seasons. */
export const MERGERS: Record<string, { year: number; other: string }> = {
  nhl: { year: 1979, other: "WHA" },
  nba: { year: 1976, other: "ABA" },
  nfl: { year: 1970, other: "AFL" },
};

export interface GraphNode {
  id: string;
  kind: "entry" | "stretch";
  column: number;
  order: number;
  /** Entry nodes: the season the franchises first appear in. */
  year?: number;
  members: Franchise[];
  /** Stretch nodes. */
  franchise?: Franchise;
  stretch?: Stretch;
  index?: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  value: number;
  franchise: Franchise;
}

export interface Graph { nodes: GraphNode[]; links: GraphLink[]; columns: number }

/** The Sankey of the franchises: entry season, then one node per stretch. Every franchise is a lane of the same thickness. */
export function lineageGraph(fs: Franchise[]): Graph {
  const sorted = [...fs].sort((a, b) => a.first - b.first || a.stretches[0]!.name.localeCompare(b.stretches[0]!.name));
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const entries = new Map<number, GraphNode>();
  let columns = 1;
  sorted.forEach((f, order) => {
    let entry = entries.get(f.first);
    if (!entry) {
      entry = { id: `e${f.first}`, kind: "entry", column: 0, order: f.first, year: f.first, members: [] };
      entries.set(f.first, entry);
      nodes.push(entry);
    }
    entry.members.push(f);
    let prev = entry.id;
    f.stretches.forEach((s, i) => {
      const id = `s${f.f}-${i}`;
      nodes.push({ id, kind: "stretch", column: i + 1, order, members: [f], franchise: f, stretch: s, index: i });
      links.push({ id: `l${prev}>${id}`, source: prev, target: id, value: 1, franchise: f });
      prev = id;
      columns = Math.max(columns, i + 2);
    });
  });
  return { nodes, links, columns };
}
