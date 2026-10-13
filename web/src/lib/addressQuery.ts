/**
 * Filters a kept (static) page holds in its address without asking the server: the browser reads them, so the page is drawn once for
 * everyone and the choice still survives a reload, a shared link and the back button. The names must not be in QUERY_KEYS
 * (lib/routing.ts): a key listed there sends the request to the page drawn per request.
 *
 * `addressSearch` is the snapshot for useSyncExternalStore (the raw query string, "" on the server); `readParam` picks one value out
 * of it, and `writeParams` changes some values in the address without a navigation and tells the subscribers.
 */

const listeners = new Set<() => void>();

export const addressSearch = (): string => {
  try { return window.location.search; } catch { return ""; }
};
export const serverSearch = (): string => "";

export function subscribeSearch(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => { listeners.delete(cb); window.removeEventListener("popstate", cb); };
}

/** One parameter's value from a query string, or "" when it is missing. */
export function readParam(search: string, key: string): string {
  try { return new URLSearchParams(search).get(key) ?? ""; } catch { return ""; }
}

/** Sets (or, for "", removes) parameters in the address, keeping the rest, and tells the subscribers. */
export function writeParams(changes: Record<string, string>): void {
  try {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(changes)) {
      if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
    }
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  } catch { /* the address stays as it is */ }
  listeners.forEach((cb) => cb());
}
