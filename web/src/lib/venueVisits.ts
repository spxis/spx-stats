/**
 * The "venues I have visited" list. It lives in the reader's own browser and nowhere else: this file is the pure part (the shape of the
 * list, reading and writing its JSON, merging two lists, the counts), so a node script can test it; the browser's storage and the buttons
 * are in components/visitsStore.ts and components/VenueVisits.tsx.
 *
 * A visit is kept under the venue's Wikidata id (or `geo:<lat>,<lon>` for the few venues Wikidata does not identify, the same id as the
 * open dataset's), never its page address, so the list survives a venue's page being renamed.
 */

export const VISITS_KEY = "spxn-venue-visits";
export const VISITS_VERSION = 1;
/** The app name written into an exported file, so an import can tell a file of this list from any other JSON. */
export const VISITS_APP = "spxn-venue-visits";
export const NOTE_MAX = 140;
/** More than the site has venues by a wide margin; a file with more is not a list of ours. */
export const MAX_VISITS = 5000;
/** The largest file an import will read. */
export const IMPORT_MAX_BYTES = 1_000_000;

/** One visit: the day (YYYY-MM-DD, or null), a short note (the game seen), and when the entry last changed (ms, for merging). */
export interface Visit { d: string | null; n: string; t: number }
export type Visits = Record<string, Visit>;

const at5 = (n: number) => n.toFixed(5);
/** The key of a venue: its Wikidata id, else its coordinates. */
export const venueKey = (wid: string | null | undefined, lat: number, lon: number): string => (wid ? wid.toUpperCase() : `geo:${at5(lat)},${at5(lon)}`);
export const isVenueKey = (k: string): boolean => /^(Q[1-9]\d{0,14}|geo:-?\d{1,3}\.\d{5},-?\d{1,3}\.\d{5})$/.test(k);

/** A real calendar day written YYYY-MM-DD. */
export function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
const cleanNote = (s: unknown): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "");

export type ParseStatus = "ok" | "empty" | "bad" | "newer";
export interface Parsed { visits: Visits; status: ParseStatus; /** Entries in the text that were not usable and so left out. */ skipped: number }

/**
 * The list a text holds. Never throws: no text is "empty", text that is not our JSON is "bad", and a list written by a newer version of
 * the site (a larger `v`) is "newer", read as empty so the caller can leave it alone rather than write over it. Usable entries are kept
 * and the others counted in `skipped`. Accepts what is stored and what is exported (which adds `app` and `exported`).
 */
export function parseVisits(text: string | null | undefined): Parsed {
  if (text == null || text === "") return { visits: {}, status: "empty", skipped: 0 };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { visits: {}, status: "bad", skipped: 0 }; }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { visits: {}, status: "bad", skipped: 0 };
  const o = data as Record<string, unknown>;
  if (o.app !== undefined && o.app !== VISITS_APP) return { visits: {}, status: "bad", skipped: 0 };
  if (typeof o.v !== "number" || !Number.isInteger(o.v) || o.v < 1) return { visits: {}, status: "bad", skipped: 0 };
  if (o.v > VISITS_VERSION) return { visits: {}, status: "newer", skipped: 0 };
  const list = o.visits;
  if (typeof list !== "object" || list === null || Array.isArray(list)) return { visits: {}, status: "bad", skipped: 0 };
  const visits: Visits = {};
  let skipped = 0;
  for (const [k, raw] of Object.entries(list as Record<string, unknown>)) {
    if (!isVenueKey(k) || typeof raw !== "object" || raw === null || Array.isArray(raw) || Object.keys(visits).length >= MAX_VISITS) { skipped++; continue; }
    const e = raw as Record<string, unknown>;
    visits[k] = {
      d: typeof e.d === "string" && validDate(e.d) ? e.d : null,
      n: cleanNote(e.n),
      t: typeof e.t === "number" && Number.isFinite(e.t) && e.t >= 0 ? Math.floor(e.t) : 0,
    };
  }
  return { visits, status: Object.keys(visits).length ? "ok" : "empty", skipped };
}

/** The JSON for storage or export; empty parts are left out, keys are sorted so the same list always writes the same text. */
export function serializeVisits(visits: Visits, extra: Record<string, string> = {}): string {
  const out: Record<string, { d?: string; n?: string; t: number }> = {};
  for (const k of Object.keys(visits).sort()) {
    const v = visits[k];
    out[k] = { ...(v.d ? { d: v.d } : {}), ...(v.n ? { n: v.n } : {}), t: v.t };
  }
  return JSON.stringify({ ...extra, v: VISITS_VERSION, visits: out });
}

/** The file an export writes: the list with the app's name and the day. */
export const exportVisits = (visits: Visits, day: string): string => serializeVisits(visits, { app: VISITS_APP, exported: day });

/** Both lists together; for a venue in both, the entry that changed last wins (the first on a tie). */
export function mergeVisits(a: Visits, b: Visits): Visits {
  const out: Visits = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.t > out[k].t) out[k] = v;
  return out;
}

/** Marks a venue visited (keeping what it had) or removes it. Returns the same object when nothing changes. */
export function setVisited(visits: Visits, key: string, on: boolean, now: number): Visits {
  if (on === !!visits[key]) return visits;
  if (!on) { const rest = { ...visits }; delete rest[key]; return rest; }
  return { ...visits, [key]: { d: null, n: "", t: now } };
}

/** Sets a venue's day and note (marking it visited if it was not). A day that is not a real date is dropped. */
export function setDetails(visits: Visits, key: string, d: string | null, n: string, now: number): Visits {
  const day = d && validDate(d) ? d : null, note = cleanNote(n);
  const had = visits[key];
  if (had && had.d === day && had.n === note) return visits;
  return { ...visits, [key]: { d: day, n: note, t: now } };
}

/** What the counts need to know of a venue. */
export interface Countable { key: string; leagues: readonly string[]; current: boolean }
/** Venues in a group, how many are visited, how many of the group no club plays at now ("gone"), and how many of the visited are gone. */
export interface Tally { of: number; seen: number; goneOf: number; goneSeen: number }
export interface Counts { all: Tally; byLeague: Record<string, Tally> }

const blank = (): Tally => ({ of: 0, seen: 0, goneOf: 0, goneSeen: 0 });
function add(t: Tally, seen: boolean, gone: boolean) {
  t.of++;
  if (seen) t.seen++;
  if (gone) { t.goneOf++; if (seen) t.goneSeen++; }
}

/** The counts for the whole list and for each league (a venue several leagues used counts once in each, and once in the total). Entries for venues not in `rows` are ignored. */
export function countVisits(rows: readonly Countable[], visits: Visits): Counts {
  const all = blank(), byLeague: Record<string, Tally> = {};
  for (const r of rows) {
    const seen = !!visits[r.key], gone = !r.current;
    add(all, seen, gone);
    for (const lg of r.leagues) add(byLeague[lg] ??= blank(), seen, gone);
  }
  return { all, byLeague };
}

/** Whether a venue passes the visited filter ("" lets everything through). */
export const visitMatches = (mode: "" | "yes" | "no", key: string, visits: Visits): boolean => mode === "" || (mode === "yes") === !!visits[key];
