"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makePaths, unpackTable, type SlugTable, type SlugWire, type TeamPaths } from "@/lib/slug";

interface Known { table: SlugTable; paths: TeamPaths }

/** The team addresses, carried to the parts of the site drawn in the browser. A page's own provider (components/TeamData.tsx) adds its leagues to those above it. */
const PathsContext = createContext<Known>({ table: {}, paths: makePaths({}) });

export function SlugProvider({ table, children }: { table: SlugWire; children: ReactNode }) {
  const above = useContext(PathsContext);
  const known = useMemo<Known>(() => {
    const merged = { ...above.table, ...unpackTable(table) };
    return { table: merged, paths: makePaths(merged) };
  }, [above, table]);
  return <PathsContext.Provider value={known}>{children}</PathsContext.Provider>;
}

export const usePaths = (): TeamPaths => useContext(PathsContext).paths;
