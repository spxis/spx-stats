/**
 * The page numbers a pager shows: the first and last page, the current one and `siblings` on each side, with `null` standing for an ellipsis.
 * A gap of exactly one page is filled with that page (a "…" in place of one number is no shorter). Pure, so the pager and a node script share it.
 *   pageWindow(49, 999)    -> 1 … 47 48 49 50 51 … 999
 *   pageWindow(49, 999, 1) -> 1 … 48 49 50 … 999
 */
export function pageWindow(page: number, pages: number, siblings = 2): (number | null)[] {
  if (!Number.isFinite(pages) || pages < 1) return [];
  const last = Math.floor(pages);
  const at = Math.min(Math.max(1, Math.floor(Number.isFinite(page) ? page : 1)), last);
  const keep = new Set<number>([1, last]);
  for (let n = at - siblings; n <= at + siblings; n++) if (n >= 1 && n <= last) keep.add(n);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev === 2) out.push(prev + 1);
    else if (n - prev > 2) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

/** Up to this many pages the jump control is a select of every page; past it a number box (a select of a thousand lines is clumsy to scroll). */
export const JUMP_SELECT_MAX = 200;

/** The page a typed or chosen value means, kept inside 1..pages; null when it is no number at all. */
export function clampPage(raw: unknown, pages: number): number | null {
  const text = String(raw ?? "").trim();
  const n = Number(text);
  if (text === "" || !Number.isFinite(n)) return null;
  return Math.min(Math.max(1, Math.floor(n)), Math.max(1, Math.floor(pages)));
}
