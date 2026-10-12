/** Keeps what a function answered for a while (per server instance), so a busy endpoint does not rebuild the same table on every request. A failed answer is not kept. */
export function memo<T>(ms: number, load: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let held: Promise<T> | null = null;
  return () => {
    if (held && Date.now() - at < ms) return held;
    at = Date.now();
    const mine = (held = load());
    mine.catch(() => { if (held === mine) held = null; });
    return mine;
  };
}
