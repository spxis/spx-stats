"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makePaths, unpackTable, type SlugWire, type TeamPaths } from "@/lib/slug";

/** The team addresses, carried to the parts of the site drawn in the browser (set once, in the root layout). */
const PathsContext = createContext<TeamPaths>(makePaths({}));

export function SlugProvider({ table, children }: { table: SlugWire; children: ReactNode }) {
  const paths = useMemo(() => makePaths(unpackTable(table)), [table]);
  return <PathsContext.Provider value={paths}>{children}</PathsContext.Provider>;
}

export const usePaths = (): TeamPaths => useContext(PathsContext);
