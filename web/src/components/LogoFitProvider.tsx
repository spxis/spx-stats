"use client";

import { createContext, useContext, type ReactNode } from "react";
import { logoKey, fitFromTuple, type Fit, type FitTable } from "@/lib/logoFit";

/** The approved logo fits (db/seed/logo_fit.csv), carried to every TeamLogo drawn in the browser (set once, in the root layout). */
const FitContext = createContext<FitTable>({});

export function LogoFitProvider({ table, children }: { table: FitTable; children: ReactNode }) {
  return <FitContext.Provider value={table}>{children}</FitContext.Provider>;
}

/** The approved fit of a logo URL, or null for a logo drawn as it always was. */
export function useLogoFit(url: string | null | undefined): Fit | null {
  const table = useContext(FitContext);
  const key = logoKey(url);
  const tuple = key ? table[key] : undefined;
  return tuple ? fitFromTuple(tuple) : null;
}
