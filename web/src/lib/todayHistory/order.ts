import type { HistoryFact } from "./types.ts";

/** Newest year first, always, the way the site's lists run. Lines of one year keep the order they are given in (`Array.prototype.sort` is stable), which the build fixes: league, then kind, then the sentence. */
export const newestFirst = (facts: readonly HistoryFact[]): HistoryFact[] => [...facts].sort((a, b) => b.y - a.y);
