import { format, utcFormat } from "d3";

/** Winning shares are written the sports way (.650 is 0.650 here) in every language. */
export const fmt3 = format(".3f");
/** A calendar day as the machine-readable key the data and the address use. */
export const isoDay = utcFormat("%Y-%m-%d");
export const atUtc = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);
