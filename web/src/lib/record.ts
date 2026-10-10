export type RecordKey = "w" | "l" | "t" | "o";
export interface RecordPart { k: RecordKey; n: number }

/** Wins, losses, ties and overtime losses of a record, in the order the donut draws them. */
export function recordParts(r: { w?: number | null; l?: number | null; t?: number | null; otl?: number | null }): RecordPart[] {
  return [
    { k: "w", n: r.w || 0 },
    { k: "l", n: r.l || 0 },
    { k: "t", n: r.t || 0 },
    { k: "o", n: r.otl || 0 },
  ];
}

/** A record as it is written: 40–30, 40–30–5, 40–30–5–3 (ties and overtime losses only when there are any). */
export function recordText(r: { w: number; l: number; t?: number | null; otl?: number | null }): string {
  return `${r.w || 0}–${r.l || 0}${r.t ? `–${r.t}` : ""}${r.otl ? `–${r.otl}` : ""}`;
}
