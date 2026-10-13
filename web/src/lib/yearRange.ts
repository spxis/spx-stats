/** Where the home chart's year range is remembered: the address (?from=&to=) and, as the default for later visits, localStorage.
    The range lives in a small store so React can read it with useSyncExternalStore: the server and the first hydration draw the
    full range, then the client switches to the address's range or the saved one in the same pass. */

const KEY = "spxn-range";

export interface YearSpan { from: number; to: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function whole(v: string | null): string {
  return v !== null && /^\d{1,4}$/.test(v) ? v : "";
}

/** The range as text, "from-to" ("-to", "from-" when one end is missing), or "" for none. The address wins over storage. */
function readRaw(): string {
  try {
    const q = new URLSearchParams(window.location.search);
    const f = whole(q.get("from")), t = whole(q.get("to"));
    if (f || t) return `${f}-${t}`;
  } catch { /* no address to read */ }
  try {
    const m = /^(\d{1,4})-(\d{1,4})$/.exec(window.localStorage.getItem(KEY) ?? "");
    if (m) return `${m[1]}-${m[2]}`;
  } catch { /* storage may be blocked */ }
  return "";
}

let chosen: string | undefined; // set once the reader has moved a handle; until then the address and storage speak
const listeners = new Set<() => void>();

export const subscribeRange = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const snapshotRange = () => chosen ?? readRaw();
export const serverRange = () => "";

export function chooseRange(r: YearSpan): void {
  chosen = `${r.from}-${r.to}`;
  listeners.forEach((cb) => cb());
}

/** The range inside min..max with from <= to, or null for the full range. */
export function parseRange(raw: string, min: number, max: number): YearSpan | null {
  const m = /^(\d*)-(\d*)$/.exec(raw);
  if (!m || (!m[1] && !m[2])) return null;
  const f = clamp(m[1] ? Number(m[1]) : min, min, max), t = clamp(m[2] ? Number(m[2]) : max, min, max);
  return { from: Math.min(f, t), to: Math.max(f, t) };
}

/** Puts the range in the address without a navigation; the full range leaves the address plain. */
export function writeAddress(r: YearSpan, min: number, max: number): void {
  try {
    const url = new URL(window.location.href);
    if (r.from <= min && r.to >= max) { url.searchParams.delete("from"); url.searchParams.delete("to"); }
    else { url.searchParams.set("from", String(r.from)); url.searchParams.set("to", String(r.to)); }
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  } catch { /* the address stays as it is */ }
}

/** Remembers the range for the next visit; the full range forgets it. */
export function saveRange(r: YearSpan, min: number, max: number): void {
  try {
    if (r.from <= min && r.to >= max) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, `${r.from}-${r.to}`);
  } catch { /* storage may be blocked */ }
}
