/**
 * The address of a venue's page: /venue/<slug>. The slug is made from the venue's name now; a name two venues share ("Memorial Stadium")
 * gets its city after it, and if that still leaves two alike the Wikidata id, so every slug is unique. The same input always gives the
 * same slugs, whatever order the venues arrive in. A Wikidata id (Q612227) is also an address: it redirects to the slug, so another page
 * can link to a venue without knowing its name.
 *
 * Pure and import-light, so a node script can test it.
 */
import { slugify } from "./slug.ts";

/** What a slug is made from. */
export interface SlugInput {
  /** Any text that tells the venues apart (the row id). */
  id: string;
  /** The name now. */
  name: string;
  wid: string | null;
  /** The slug of the venue's city page, else its place as text ("Montreal, QC"). */
  city: string | null;
}

/** A Wikidata item id, as the address of a venue: Q612227 (any case). */
export const WIKIDATA_ID = /^[Qq]\d{1,12}$/;

const base = (name: string) => {
  const s = slugify(name) || "venue";
  // an id-shaped slug would be read as a Wikidata id
  return WIKIDATA_ID.test(s) ? `${s}-venue` : s;
};

/** The slug of every venue, by `id`. */
export function venueSlugs(list: readonly SlugInput[]): Map<string, string> {
  const first = list.map((v) => ({ v, slug: base(v.name) }));
  const count = new Map<string, number>();
  for (const x of first) count.set(x.slug, (count.get(x.slug) ?? 0) + 1);
  // a shared name takes the city after it
  const second = first.map(({ v, slug }) => {
    const city = (count.get(slug) ?? 0) > 1 && v.city ? slugify(v.city) : "";
    return { v, slug: city && !slug.endsWith(`-${city}`) ? `${slug}-${city}` : slug };
  });
  const again = new Map<string, number>();
  for (const x of second) again.set(x.slug, (again.get(x.slug) ?? 0) + 1);
  // a slug nobody shares is kept first; what is still shared takes the Wikidata id, else a number, in id order
  const shared = (x: { slug: string }) => ((again.get(x.slug) ?? 0) > 1 ? 1 : 0);
  const sorted = [...second].sort((a, b) => shared(a) - shared(b) || (a.v.id < b.v.id ? -1 : a.v.id > b.v.id ? 1 : 0));
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const x of sorted) {
    const { v, slug } = x;
    let s = shared(x) && v.wid ? `${slug}-${v.wid.toLowerCase()}` : slug;
    for (let n = 2; taken.has(s); n++) s = `${slug}-${n}`;
    taken.add(s);
    out.set(v.id, s);
  }
  return out;
}

/**
 * The venue an address names: its slug, or a Wikidata id (then `redirect` is the slug of the venue that has it, and the page goes there).
 * `byWid` maps a Wikidata id in upper case to a slug.
 */
export function resolveVenue<T>(bySlug: ReadonlyMap<string, T>, byWid: ReadonlyMap<string, string>, segment: string): { venue: T | null; redirect: string | null } {
  const direct = bySlug.get(segment);
  if (direct !== undefined) return { venue: direct, redirect: null };
  if (WIKIDATA_ID.test(segment)) {
    const slug = byWid.get(segment.toUpperCase());
    const venue = slug === undefined ? undefined : bySlug.get(slug);
    if (slug !== undefined && venue !== undefined) return { venue, redirect: slug };
  }
  return { venue: null, redirect: null };
}
