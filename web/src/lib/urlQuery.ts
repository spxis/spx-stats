/** Merges changes into the address without adding history. null or undefined removes a key; "" is kept (`?phase=` means all). */
export function replaceQuery(changes: Record<string, string | null | undefined>): void {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) q.delete(k); else q.set(k, v);
  }
  const s = q.toString();
  const href = location.pathname + (s ? `?${s}` : "");
  if (href !== location.pathname + location.search) history.replaceState(null, "", href);
}

/** The same merge as a link, for a navigation the server must answer (a sort the API orders). */
export function hrefWith(changes: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) q.delete(k); else q.set(k, v);
  }
  const s = q.toString();
  return location.pathname + (s ? `?${s}` : "");
}
