export type RowId = string | number;

interface LinkState { table: RowId | null; chart: RowId | null; pin: RowId | null; stamp: number }

/**
 * The little shared state that ties a table row to a mark on a chart, keyed by the row's id. `table` is the row the pointer
 * or keyboard is on, `chart` the point the pointer or keyboard is on, `pin` the point that was pressed. Components read one
 * slice through useSyncExternalStore, so a change redraws only what shows it, never the whole table.
 */
export function createRowLink() {
  let state: LinkState = { table: null, chart: null, pin: null, stamp: 0 };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());
  return {
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
    get: () => state,
    set: (patch: Partial<Omit<LinkState, "stamp">>) => { state = { ...state, ...patch }; emit(); },
    /** Pins a point; pressing it again counts as new, so its row scrolls into view again. */
    pin: (id: RowId) => { state = { ...state, pin: id, stamp: state.stamp + 1 }; emit(); },
  };
}

export type RowLink = ReturnType<typeof createRowLink>;

/** A link nothing ever changes: what a row or chart listens to when it is not tied to anything. */
export const idleLink = createRowLink();
