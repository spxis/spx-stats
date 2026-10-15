/**
 * The conferences and divisions of one league over its whole history, and the places each franchise has sat in, worked out from api.alignment
 * (one row per club per season, db/migrations/028_api_alignment.sql). Pure, so the teams page's server side, its browser side and a node
 * script share it. A "place" is a pair of ids: [conference, division], either of which may be null (a CFL club has no division, an NBA club
 * before 1970 no division, the NHL's 2020 divisions no conference).
 */

/** The columns of an api.alignment row this file reads. */
export interface AlignLike {
  year: number;
  franchise_id: number;
  conference: string | null;
  conference_short: string | null;
  division: string | null;
  division_short: string | null;
}

/** A conference as the filter shows it: `id` is its short name (what the address carries). */
export interface Conf { id: string; name: string; from: number; to: number }
/** A division. `id` is its short name, prefixed with its conference's id where another division of the league has the same short name (the NHL's Central of 1993-2022 and of 2020). */
export interface Div { id: string; name: string; short: string; conf: string | null; from: number; to: number }
/** [conference id, division id]. */
export type Place = [string | null, string | null];

export interface LeagueGroups {
  /** Newest first (a conference or division still in use first), then by name. */
  confs: Conf[];
  divs: Div[];
  /** Franchise id to the places it has sat in, the one it holds now (or held last) first, then the others by how recently it left them. */
  places: Map<number, Place[]>;
}

const text = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Every conference and division of a league that ever existed, and where each franchise has been. Rows with neither a conference nor a division are ignored. */
export function buildGroups(rows: readonly AlignLike[]): LeagueGroups {
  const confSpan = new Map<string, Conf>();
  const divSpan = new Map<string, { name: string; short: string; conf: string | null; from: number; to: number }>();
  const seen = new Map<number, Map<string, { place: [string | null, string | null]; year: number }>>();
  for (const r of rows) {
    const confName = text(r.conference), divName = text(r.division);
    if (!confName && !divName) continue;
    const confId = confName ? text(r.conference_short) ?? confName : null;
    if (confName && confId) {
      const c = confSpan.get(confId);
      if (c) { c.from = Math.min(c.from, r.year); c.to = Math.max(c.to, r.year); } else confSpan.set(confId, { id: confId, name: confName, from: r.year, to: r.year });
    }
    // A division is told apart by its conference too: the key is the pair of names, the id is made unique below.
    const divKey = divName ? `${confId ?? ""}|${divName}` : null;
    if (divName && divKey) {
      const d = divSpan.get(divKey);
      if (d) { d.from = Math.min(d.from, r.year); d.to = Math.max(d.to, r.year); } else divSpan.set(divKey, { name: divName, short: text(r.division_short) ?? divName, conf: confId, from: r.year, to: r.year });
    }
    const mine = seen.get(r.franchise_id) ?? new Map();
    const k = `${confId ?? ""}|${divKey ?? ""}`;
    const had = mine.get(k);
    mine.set(k, { place: [confId, divKey], year: Math.max(had?.year ?? 0, r.year) });
    seen.set(r.franchise_id, mine);
  }

  // Ids for the divisions: the short name, or conference id + short name where two divisions share one.
  const shortCount = new Map<string, number>();
  for (const d of divSpan.values()) shortCount.set(d.short, (shortCount.get(d.short) ?? 0) + 1);
  const idOf = new Map<string, string>();
  const taken = new Set<string>();
  for (const [key, d] of [...divSpan].sort((a, b) => b[1].to - a[1].to || a[0].localeCompare(b[0]))) {
    let id = (shortCount.get(d.short) ?? 0) > 1 && d.conf ? `${d.conf} ${d.short}` : d.short;
    for (let n = 2; taken.has(id); n++) id = `${d.short} ${n}`;
    taken.add(id);
    idOf.set(key, id);
  }

  const order = <T extends { to: number }>(a: T & { name: string }, b: T & { name: string }) => b.to - a.to || a.name.localeCompare(b.name);
  const confs = [...confSpan.values()].sort(order);
  const divs: Div[] = [...divSpan].map(([key, d]) => ({ id: idOf.get(key)!, name: d.name, short: d.short, conf: d.conf, from: d.from, to: d.to })).sort(order);

  const places = new Map<number, Place[]>();
  for (const [f, mine] of seen) {
    const list = [...mine.values()].sort((a, b) => b.year - a.year);
    places.set(f, list.map(({ place: [c, dk] }) => [c, dk ? idOf.get(dk) ?? null : null] as Place));
  }
  return { confs, divs, places };
}

/** How a place reads in a table cell: "East · Atlantic", or just "AL East" where the division's name already carries the conference's. */
export function placeText(g: Pick<LeagueGroups, "divs">, place: Place): string {
  const [c, d] = place;
  const div = d ? g.divs.find((x) => x.id === d)?.short ?? d : null;
  if (c && div) return div.startsWith(c) ? div : `${c} · ${div}`;
  return div ?? c ?? "";
}

/** Whether a franchise has ever sat in the conference (when one is chosen) and the division (when one is chosen), in one place. */
export function everIn(places: readonly Place[] | undefined, conf: string, div: string): boolean {
  if (!conf && !div) return true;
  return !!places?.some(([c, d]) => (!conf || c === conf) && (!div || d === div));
}

/** The last season any conference or division of the league has a row in: the year of its latest alignment. 0 for a league with no groups. */
export function currentYear(g: Pick<LeagueGroups, "confs" | "divs">): number {
  return Math.max(0, ...g.confs.map((c) => c.to), ...g.divs.map((d) => d.to));
}

/** The conferences and divisions of the league's latest alignment: the ones still in use. The rest are historic. */
export function currentGroups<G extends { confs: Conf[]; divs: Div[] }>(g: G): { confs: Conf[]; divs: Div[] } {
  const now = currentYear(g);
  return { confs: g.confs.filter((c) => c.to === now), divs: g.divs.filter((d) => d.to === now) };
}
