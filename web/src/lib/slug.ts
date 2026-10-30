import { seasonSeg } from "./leagues.ts";

/** "Montréal Canadiens" -> "montreal-canadiens", "Brooklyn Dodgers & Co." -> "brooklyn-dodgers-and-co". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A franchise's page address and, where its name changed, the address of each season: [fromYear, slug, fromYear, slug, ...]. */
export interface SlugEntry { s: string; c?: (string | number)[] }
/** league -> franchise id -> entry. Small enough to send to the browser. */
export type SlugTable = Record<string, Record<number, SlugEntry>>;

/**
 * The table as it travels to the browser (the root layout sends it to every page): per league a flat list of franchise id and entry, an entry that never
 * changed its address as the bare slug. `unpackTable` is the exact inverse of `packTable`.
 */
export type SlugWire = Record<string, (number | string | SlugEntry)[]>;

export function packTable(table: SlugTable): SlugWire {
  const out: SlugWire = {};
  for (const [lg, entries] of Object.entries(table)) {
    out[lg] = Object.entries(entries).flatMap(([f, e]) => [Number(f), e.c?.length ? e : e.s]);
  }
  return out;
}

export function unpackTable(wire: SlugWire): SlugTable {
  const out: SlugTable = {};
  for (const [lg, list] of Object.entries(wire)) {
    const entries: Record<number, SlugEntry> = {};
    for (let i = 0; i + 1 < list.length; i += 2) {
      const e = list[i + 1] as string | SlugEntry;
      entries[list[i] as number] = typeof e === "string" ? { s: e } : e;
    }
    out[lg] = entries;
  }
  return out;
}

export function seasonSlug(e: SlugEntry, y: number): string {
  let out = e.s;
  for (let i = 0; e.c && i < e.c.length; i += 2) {
    if ((e.c[i] as number) > y) break;
    out = e.c[i + 1] as string;
  }
  return out;
}

export const seasonPath = (lg: string, y: number): string => `/${lg}/${seasonSeg(lg, y)}`;

/** The season in an address segment, and whether it is the form the site uses (2001-02), not the old one (2001). */
export function parseSeasonSeg(lg: string, seg: string): { y: number; canonical: boolean } | null {
  if (/^\d{4}$/.test(seg)) return { y: Number(seg), canonical: seasonSeg(lg, Number(seg)) === seg };
  const m = /^(\d{4})-(\d{2})$/.exec(seg);
  if (m && seasonSeg(lg, Number(m[1])) === seg) return { y: Number(m[1]), canonical: true };
  return null;
}

export interface TeamPaths {
  team: (lg: string, f: number) => string;
  teamSeason: (lg: string, f: number, y: number) => string;
  /** Just the slug a team goes by in a season (as in a series address). */
  season: (lg: string, f: number, y: number) => string;
  /** A franchise's own slug (the last part of its team address), as in a head-to-head address. */
  slug: (lg: string, f: number) => string;
}

/** Address builders over a table; a franchise missing from it gets its numeric address, which redirects to the right one. */
export function makePaths(table: SlugTable): TeamPaths {
  const season = (lg: string, f: number, y: number) => {
    const e = table[lg]?.[f];
    return e ? seasonSlug(e, y) : String(f);
  };
  const slug = (lg: string, f: number) => table[lg]?.[f]?.s ?? String(f);
  return {
    team: (lg, f) => `/${lg}/team/${slug(lg, f)}`,
    teamSeason: (lg, f, y) => `/${lg}/${seasonSeg(lg, y)}/team/${season(lg, f, y)}`,
    season,
    slug,
  };
}

/** A series address split into its two team tokens (slugs, or the old franchise ids) and the meeting number. */
export function parsePair(seg: string): { a: string; b: string; meeting: number } | null {
  const m = /^([a-z0-9-]+?)-vs-([a-z0-9-]+?)(?:-([2-9]))?$/.exec(seg);
  return m && m[1] !== m[2] ? { a: m[1], b: m[2], meeting: m[3] ? Number(m[3]) : 1 } : null;
}

/** A path with the query string it arrived with. */
export function withQuery(path: string, sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) q.append(k, x);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export interface NameRow { league: string; franchise_id: number; name: string; name_from: string | null; name_to: string | null }
export interface SeasonNameRow { league: string; year: number; franchise_id: number; team: string | null }

export interface LeagueSlugs {
  entries: Record<number, SlugEntry>;
  /** current-name slug -> franchise */
  primary: Map<string, number>;
  /** every slug a franchise has ever gone by -> franchises */
  index: Map<string, number[]>;
  years: Map<number, Set<number>>;
  last: Map<number, number>;
  /** franchise -> the name it wears now, every other name it has had, and the first and last season it played (0 when it has no season) */
  clubs: Map<number, { name: string; alt: string[]; first: number; last: number }>;
}

export interface Clash { league: string; slug: string; kind: "franchise" | "season"; year?: number; franchises: number[]; chosen: string[] }

export interface Slugs { leagues: Record<string, LeagueSlugs>; clashes: Clash[] }

const addTo = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const l = m.get(k);
  if (!l) m.set(k, [v]);
  else if (!l.includes(v)) l.push(v);
};

/**
 * Builds every league's addresses from the franchise names and the team names of each season. A franchise's page uses its
 * latest name and a season page that season's name. Where two franchises would share an address, each gets its first
 * season appended (ottawa-senators-1917); the latest of them and every other name stay plain.
 */
export function buildSlugs(names: NameRow[], seasons: SeasonNameRow[]): Slugs {
  const leagues: Record<string, LeagueSlugs> = {};
  const clashes: Clash[] = [];
  const codes = [...new Set([...names.map((n) => n.league), ...seasons.map((s) => s.league)])].sort();
  for (const lg of codes) {
    const fNames = names.filter((n) => n.league === lg);
    const fSeasons = seasons.filter((s) => s.league === lg).sort((a, b) => a.year - b.year);
    const ids = [...new Set([...fNames.map((n) => n.franchise_id), ...fSeasons.map((s) => s.franchise_id)])].sort((a, b) => a - b);
    const years = new Map<number, Set<number>>();
    const first = new Map<number, number>();
    const last = new Map<number, number>();
    const byYear = new Map<number, Map<number, string>>();
    const everyName = new Map<number, Set<string>>();
    for (const s of fSeasons) {
      if (!years.has(s.franchise_id)) years.set(s.franchise_id, new Set());
      years.get(s.franchise_id)!.add(s.year);
      if (!first.has(s.franchise_id)) first.set(s.franchise_id, s.year);
      last.set(s.franchise_id, s.year);
      if (s.team) {
        if (!byYear.has(s.franchise_id)) byYear.set(s.franchise_id, new Map());
        byYear.get(s.franchise_id)!.set(s.year, s.team);
        if (!everyName.has(s.franchise_id)) everyName.set(s.franchise_id, new Set());
        everyName.get(s.franchise_id)!.add(s.team);
      }
    }
    const current = new Map<number, string>();
    for (const f of ids) {
      const mine = fNames.filter((n) => n.franchise_id === f);
      for (const n of mine) {
        if (!everyName.has(f)) everyName.set(f, new Set());
        everyName.get(f)!.add(n.name);
      }
      const latest = [...mine].sort((a, b) => (a.name_to ?? "9999").localeCompare(b.name_to ?? "9999") || (a.name_from ?? "").localeCompare(b.name_from ?? "")).at(-1);
      const lastSeason = [...(byYear.get(f) ?? [])].sort((a, b) => a[0] - b[0]).at(-1)?.[1];
      current.set(f, latest?.name ?? lastSeason ?? `team ${f}`);
      if (!first.has(f)) first.set(f, Number(mine.map((n) => n.name_from).filter(Boolean).sort()[0]?.slice(0, 4)) || 0);
    }

    // The franchise that played most recently keeps the plain slug; the others get their first season appended (and their id if that is not enough).
    const apart = (list: number[], slug: string): string[] => {
      const order = [...list].sort((a, b) => (last.get(b) ?? 0) - (last.get(a) ?? 0) || (years.get(b)?.size ?? 0) - (years.get(a)?.size ?? 0) || a - b);
      const used = new Set<string>([slug]);
      const got = new Map<number, string>([[order[0], slug]]);
      for (const f of order.slice(1)) {
        let s = `${slug}-${first.get(f)}`;
        if (used.has(s)) s = `${s}-${f}`;
        used.add(s);
        got.set(f, s);
      }
      return list.map((f) => got.get(f)!);
    };

    // A franchise's own address.
    const groups = new Map<string, number[]>();
    for (const f of ids) addTo(groups, slugify(current.get(f)!), f);
    const primarySlug = new Map<number, string>();
    for (const [slug, list] of groups) {
      if (list.length === 1) { primarySlug.set(list[0], slug); continue; }
      const chosen = apart(list, slug);
      list.forEach((f, i) => primarySlug.set(f, chosen[i]));
      clashes.push({ league: lg, slug, kind: "franchise", franchises: list, chosen });
    }

    // Each season's address: that season's name, kept apart across franchises within the year.
    const seasonBase = new Map<number, Map<number, string>>();
    const yearGroups = new Map<number, Map<string, number[]>>();
    for (const f of ids) {
      const m = new Map<number, string>();
      let cur = slugify(current.get(f)!);
      for (const y of [...(years.get(f) ?? [])].sort((a, b) => a - b)) {
        const t = byYear.get(f)?.get(y);
        if (t) cur = slugify(t);
        m.set(y, cur);
        if (!yearGroups.has(y)) yearGroups.set(y, new Map());
        addTo(yearGroups.get(y)!, cur, f);
      }
      seasonBase.set(f, m);
    }
    for (const [y, g] of yearGroups) {
      for (const [slug, list] of g) {
        if (list.length < 2) continue;
        const chosen = apart(list, slug);
        list.forEach((f, i) => seasonBase.get(f)!.set(y, chosen[i]));
        clashes.push({ league: lg, slug, kind: "season", year: y, franchises: list, chosen });
      }
    }

    const entries: Record<number, SlugEntry> = {};
    const index = new Map<string, number[]>();
    const primary = new Map<string, number>();
    for (const f of ids) {
      const s = primarySlug.get(f)!;
      primary.set(s, f);
      addTo(index, s, f);
      const e: SlugEntry = { s };
      let cur = s;
      for (const [y, v] of [...seasonBase.get(f)!].sort((a, b) => a[0] - b[0])) {
        if (v !== cur) { (e.c ??= []).push(y, v); cur = v; }
        addTo(index, v, f);
      }
      for (const n of everyName.get(f) ?? []) addTo(index, slugify(n), f);
      entries[f] = e;
    }
    const clubs = new Map<number, { name: string; alt: string[]; first: number; last: number }>();
    for (const f of ids) clubs.set(f, { name: current.get(f)!, alt: [...(everyName.get(f) ?? [])].filter((n) => n !== current.get(f)), first: first.get(f) ?? 0, last: last.get(f) ?? 0 });
    leagues[lg] = { entries, primary, index, years, last, clubs };
  }
  return { leagues, clashes };
}

const newest = (L: LeagueSlugs, list: number[]) => [...list].sort((a, b) => (L.last.get(b) ?? 0) - (L.last.get(a) ?? 0) || b - a)[0];

/** The franchise a team-page segment means: a current-name slug, any older name, or the old numeric id. */
export function resolveFranchise(L: LeagueSlugs | undefined, seg: string): number | null {
  if (!L) return null;
  if (/^\d{1,9}$/.test(seg)) return L.entries[Number(seg)] ? Number(seg) : null;
  const p = L.primary.get(seg);
  if (p != null) return p;
  const list = L.index.get(seg);
  return list?.length ? newest(L, list) : null;
}

/** The franchise that has worn this club name in the league; null when none has. */
export function franchiseNamed(L: LeagueSlugs | undefined, name: string | null | undefined): number | null {
  if (!L || !name) return null;
  for (const [f, c] of L.clubs) if (c.name === name || c.alt.includes(name)) return f;
  return null;
}

/** The franchise a team-season segment means for a year: that season's slug, else any other name of a franchise that played then. */
export function resolveTeamSeason(L: LeagueSlugs | undefined, y: number, seg: string): number | null {
  if (!L) return null;
  if (/^\d{1,9}$/.test(seg)) return L.entries[Number(seg)] ? Number(seg) : null;
  const cands = L.index.get(seg) ?? [];
  const played = cands.filter((f) => L.years.get(f)?.has(y));
  return played.find((f) => seasonSlug(L.entries[f], y) === seg) ?? played[0]
    ?? cands.find((f) => seasonSlug(L.entries[f], y) === seg) ?? (cands.length ? newest(L, cands) : null);
}

/** What a browser needs to build addresses: the table without the lookups. */
export function tableOf(s: Slugs, leagues?: readonly string[]): SlugTable {
  const out: SlugTable = {};
  for (const [lg, L] of Object.entries(s.leagues)) if (!leagues || leagues.includes(lg)) out[lg] = L.entries;
  return out;
}
