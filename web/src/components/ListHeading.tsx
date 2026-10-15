import { listLabel } from "@/lib/listTitle";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";

/**
 * The heading of a list page: the fixed page word exactly as every other page draws it, then the filters that are on in a smaller, muted
 * suffix on the same line (wrapping a whole filter at a time). A screen reader gets one sentence ("Players, filtered: NHL, from Russia").
 */
export function ListHeading({ say, head, filters }: { say: (key: PhraseKey, vars?: Record<string, string>) => string; head: string; filters: string[] }) {
  return (
    <h1 aria-label={filters.length ? listLabel(say, head, filters) : undefined}>
      {head}
      {filters.map((f) => <span key={f} className="hfilter" aria-hidden="true">{" "}<span className="hdot">·</span> {f}</span>)}
    </h1>
  );
}
