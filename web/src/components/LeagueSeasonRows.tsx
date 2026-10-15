"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LeagueSeasonRow } from "@/lib/leagueSeasonRows";

const RowsContext = createContext<{ league: string; rows: LeagueSeasonRow[] }>({ league: "", rows: [] });

/** Carries a league's seasons (short plain data, lib/leagueSeasonRows.ts) to the season chips, the heat strip and the bar chart, so the page sends them once. */
export function LeagueSeasonRows({ league, rows, children }: { league: string; rows: LeagueSeasonRow[]; children: ReactNode }) {
  const value = useMemo(() => ({ league, rows }), [league, rows]);
  return <RowsContext.Provider value={value}>{children}</RowsContext.Provider>;
}

export const useLeagueSeasonRows = () => useContext(RowsContext);
