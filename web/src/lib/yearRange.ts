/** Where a page's year range is remembered: the address (?from=&to=) and, as the default for later visits, localStorage (a key per page,
    RANGE_PAGES). The players list (ListRange) reads it itself, and the teams list (TeamsBoard) in the browser; this is about the home chart. The range lives in a small store so React can read it with useSyncExternalStore: the server and the first hydration draw the
    full range, then the client switches to the address's range or the saved one in the same pass. The page holds the chart out of
    sight meanwhile (RANGE_HOLD_SCRIPT), so the full range is never painted when another one is wanted. */

import { LEAGUE_CODES } from "./leagues.ts";

const KEY = "spxn-range";

/** The pages that keep a year range: where each is remembered (a key per page) and whether an address range also needs the hold. The home chart
    draws in the browser, so it waits for an address range as well as a saved one; the players list is drawn by the server, which
    reads an address range itself, so only a saved range (one the server cannot see) holds it back; the teams list is drawn in the browser like the home chart. */
export const RANGE_PAGES: Record<string, { key: string; holdForAddress: boolean }> = {
  "/": { key: KEY, holdForAddress: true },
  "/players": { key: "spxn-range-players", holdForAddress: false },
  "/teams": { key: "spxn-range-teams", holdForAddress: true },
  "/admin/people": { key: "spxn-range-people", holdForAddress: false },
};

/** The league pages (/nhl, /nba ...) take a range from the address only, nothing is saved for them: they wait for an address range like the home chart. */
const LEAGUE_ROOTS = LEAGUE_CODES.map((c) => `/${c}`);

/** Runs in the document head, before the first paint. When the page holds a range the viewer wants (in the address, or saved) it sets
    data-yr-pending on <html>, and the stylesheet keeps the chart or list invisible (its height reserved) until it is drawn at that range.
    With no script or no saved range nothing is set and the page shows as usual. The test mirrors readRaw below and runs on RANGE_PAGES and the league pages only. */
export const RANGE_HOLD_SCRIPT = `try{var L=${JSON.stringify(LEAGUE_ROOTS)},W=location.pathname,P=${JSON.stringify(RANGE_PAGES)}[W]||(L.indexOf(W)>=0?{key:'',holdForAddress:true}:/^\\/(?:${LEAGUE_CODES.join("|")})\\/player\\/[^\\/]+$/.test(W)?{key:'spxn-range-p:'+W,holdForAddress:true}:/^\\/city\\/[^\\/]+$/.test(W)?{key:'spxn-range-c:'+W,holdForAddress:true}:0);if(P){var q=new URLSearchParams(location.search),d=/^\\d{1,4}$/,u=d.test(q.get('from')||'')||d.test(q.get('to')||'')||d.test(q.get('season')||''),h=u&&P.holdForAddress;if(!u&&P.key){try{h=/^\\d{1,4}-\\d{1,4}$/.test(localStorage.getItem(P.key)||'')}catch(e){}}if(h)document.documentElement.setAttribute('data-yr-pending','')}}catch(e){}`;

/** Holds the page's chart or list out of sight (see RANGE_HOLD_SCRIPT) for a visit made inside the site, which the head script never sees. */
export function holdRange(): void {
  document.documentElement.setAttribute("data-yr-pending", "");
}

/** Lets the chart show: the Heatmap calls this once it has drawn the wanted range. */
export function releaseRangeHold(): void {
  document.documentElement.removeAttribute("data-yr-pending");
}

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

export interface RangePreset { id: "all" | "last10" | "since" | "spx" | "peak"; from: number; to: number; year?: number }

/** One-tap ranges inside min..max: all, the latest ten seasons, since 2000 and 1990, and SPX's own years. A preset that would repeat an earlier span is left out. */
export function rangePresets(min: number, max: number): RangePreset[] {
  const wanted: RangePreset[] = [
    { id: "all", from: min, to: max },
    { id: "last10", from: max - 9, to: max },
    { id: "since", from: 2000, to: max, year: 2000 },
    { id: "since", from: 1990, to: max, year: 1990 },
    { id: "spx", from: 1997, to: 2013 },
  ];
  const seen = new Set<string>();
  const out: RangePreset[] = [];
  for (const p of wanted) {
    const from = clamp(p.from, min, max), to = clamp(p.to, min, max);
    if (from > to || seen.has(`${from}-${to}`)) continue;
    seen.add(`${from}-${to}`);
    out.push({ ...p, from, to });
  }
  return out;
}

/** The range moved by `years` (rounded to a whole year), width unchanged. At either end of min..max the window stops there instead of
    shrinking; a window as wide as min..max, or wider, does not move. */
export function panRange(r: YearSpan, years: number, min: number, max: number): YearSpan {
  const width = r.to - r.from;
  const from = clamp(r.from + Math.round(years), min, Math.max(min, max - width));
  return { from, to: from + width };
}

/** The range a drag has reached: it began as `start` and the pointer has since moved `dx` px along a line `lineWidth` px wide that spans min..max. */
export function panByPixels(start: YearSpan, dx: number, lineWidth: number, min: number, max: number): YearSpan {
  return panRange(start, lineWidth > 0 ? (dx / lineWidth) * (max - min) : 0, min, max);
}

/** The least width in px of the part of the bar a press moves as a whole: a finger needs more than a pointer, and a one-year range is only a pixel or two wide. */
export const PAN_GRIP_TOUCH = 24;
export const PAN_GRIP_MOUSE = 8;
/** How far in px from a handle's centre a press still takes that handle (the visible knob is 14 px across). */
export const KNOB_REACH = 10;

/** What a press at `x` grabs, given the handles' px positions `a` <= `b` on the same line. The bar between the handles moves the whole range,
    except KNOB_REACH next to each handle; a bar too narrow for that still has a middle of `grip` px (padded past the handles if need be).
    Anywhere else the nearer handle is taken. */
export function grabAt(x: number, a: number, b: number, grip: number = PAN_GRIP_TOUCH): "start" | "end" | "pan" {
  const mid = (a + b) / 2, half = Math.max(grip, b - a - 2 * KNOB_REACH) / 2;
  return Math.abs(x - mid) <= half ? "pan" : x < mid ? "start" : "end";
}

/** The range inside min..max with from <= to, or null for the full range. */
export function parseRange(raw: string, min: number, max: number): YearSpan | null {
  const m = /^(\d*)-(\d*)$/.exec(raw);
  if (!m || (!m[1] && !m[2])) return null;
  const f = clamp(m[1] ? Number(m[1]) : min, min, max), t = clamp(m[2] ? Number(m[2]) : max, min, max);
  return { from: Math.min(f, t), to: Math.max(f, t) };
}

/** The range named by the text of `?from=` and `?to=` (digits only; anything else counts as missing), read inside min..max with from <= to.
    Null for none and for a range that covers min..max whole, since neither narrows anything. */
export function rangeFromQuery(from: string, to: string, min: number, max: number): YearSpan | null {
  const r = parseRange(`${whole(from)}-${whole(to)}`, min, max);
  return r && (r.from > min || r.to < max) ? r : null;
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

/** Remembers the range for the next visit (under the page's own key, the home chart's by default); the full range forgets it. */
export function saveRange(r: YearSpan, min: number, max: number, key: string = KEY): void {
  try {
    if (r.from <= min && r.to >= max) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, `${r.from}-${r.to}`);
  } catch { /* storage may be blocked */ }
}

/** The range a page's key remembers, as "from-to" text for parseRange, or "" for none. */
export function savedRange(key: string = KEY): string {
  try {
    const m = /^(\d{1,4})-(\d{1,4})$/.exec(window.localStorage.getItem(key) ?? "");
    return m ? `${m[1]}-${m[2]}` : "";
  } catch { return ""; }
}

/** The range in the address alone ("from-to" text for parseRange, "" for none): the league pages keep nothing in storage, so a range
    saved for the home chart never reaches them. */
export function addressRange(): string {
  try {
    const q = new URLSearchParams(window.location.search);
    const f = whole(q.get("from")), t = whole(q.get("to"));
    return f || t ? `${f}-${t}` : "";
  } catch { return ""; }
}

const addressListeners = new Set<() => void>();

/** For useSyncExternalStore with addressRange: told when the range is chosen on the page and when history moves back or forward. */
export function subscribeAddress(cb: () => void): () => void {
  addressListeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => { addressListeners.delete(cb); window.removeEventListener("popstate", cb); };
}

/** Puts the chosen range in the address and tells the subscribers; the address is the only place a league page keeps it. */
export function chooseAddressRange(r: YearSpan, min: number, max: number): void {
  writeAddress(r, min, max);
  addressListeners.forEach((cb) => cb());
}
