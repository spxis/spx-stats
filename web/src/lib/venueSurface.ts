/**
 * Surface, roof and open-or-closed status of a venue as words, and the venue's surface and roof by period. Pure and import-light (types only), so the
 * browser, the wire format and a node script can all use it.
 *
 * The database gives a surface as a code from a fixed list (ref.venue_surface, migration 089), a roof as open, dome or retractable, and a status of open,
 * closed or demolished. A production without migration 089 still sends the surface as the source's own text ("lawn", "artificial turf"): a value that is
 * not in the list is shown as it came.
 */
import type { Speaker } from "./i18n/i18n";

type Say = Speaker["say"];

export const SURFACE_KEY = {
  grass: "venuesPage.surfaceGrass", artificial: "venuesPage.surfaceArtificial", hybrid: "venuesPage.surfaceHybrid", ice: "venuesPage.surfaceIce",
  wood: "venuesPage.surfaceWood", multi: "venuesPage.surfaceMulti", other: "venuesPage.surfaceOther",
} as const;
export const ROOF_KEY = { open: "venuesPage.roofOpen", dome: "venuesPage.roofDome", retractable: "venuesPage.roofRetractable" } as const;
export const STATE_KEY = { closed: "venuesPage.stateClosed", demolished: "venuesPage.stateDemolished" } as const;

/** Whether a venue still stands and is in use as far as the sources say (core.brand_venue_info.status). Null when the database does not give it. */
export type VenueState = "open" | "closed" | "demolished";

const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** A surface code in the reader's language; any other text is returned as it is, and nothing is nothing. */
export function surfaceWord(value: string | null | undefined, say: Say): string | null {
  if (!value) return null;
  return has(SURFACE_KEY, value) ? say(SURFACE_KEY[value as keyof typeof SURFACE_KEY]) : value;
}

/** A roof value in the reader's language; any other text is returned as it is. */
export function roofWord(value: string | null | undefined, say: Say): string | null {
  if (!value) return null;
  return has(ROOF_KEY, value) ? say(ROOF_KEY[value as keyof typeof ROOF_KEY]) : value;
}

/** "Closed" or "Demolished"; null for an open venue or when the status is not known. */
export function stateWord(state: VenueState | null | undefined, say: Say): string | null {
  return state && has(STATE_KEY, state) ? say(STATE_KEY[state as keyof typeof STATE_KEY]) : null;
}

/** One surface or roof of a venue for the years a source dates it (api.venue_period). Years are inclusive; null is unknown (from) or still so (until). */
export interface VenuePeriod { kind: "surface" | "roof"; seq: number; value: string; raw: string | null; from: number | null; until: number | null; sport: string | null }

/** "1989–2004", "2011–today" (`today` is the reader's word for it), "2005" for one year, null when the source gives no year at all. */
export function periodYears(p: Pick<VenuePeriod, "from" | "until">, today: string): string | null {
  if (p.from == null && p.until == null) return null;
  if (p.from != null && p.from === p.until) return String(p.from);
  return `${p.from ?? "…"}–${p.until ?? today}`;
}

/** The periods of one kind, oldest first (an unknown start first), in the order the database numbered them. */
export function periodsOf(list: readonly VenuePeriod[], kind: VenuePeriod["kind"]): VenuePeriod[] {
  return list.filter((p) => p.kind === kind).sort((a, b) => (a.from ?? -1) - (b.from ?? -1) || a.seq - b.seq);
}

/** A period's product or roof name as the source wrote it, when it adds something to the word: "AstroTurf 3D Xtreme" after "Artificial turf", nothing after "Dome" if the source only said "dome". */
export function periodRaw(p: Pick<VenuePeriod, "raw">, word: string): string | null {
  const raw = p.raw?.trim();
  return raw && raw.toLowerCase() !== word.toLowerCase() ? raw : null;
}
