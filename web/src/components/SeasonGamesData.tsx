"use client";

import { createContext, useContext, useMemo } from "react";
import { unpackGames } from "@/lib/gamesCodec";
import type { ClubTeam, GameTuple } from "@/lib/season";
import { seasonGamesPath, type SeasonGamesView } from "@/lib/seasonRows";
import { useFetchedJson } from "./useFetchedJson";

interface SeasonGamesValue { ready: boolean; failed: boolean; games: GameTuple[]; teams: Map<number, ClubTeam> }

const NONE: GameTuple[] = [];
const NO_TEAMS = new Map<number, ClubTeam>();
const Ctx = createContext<SeasonGamesValue | null>(null);

/**
 * A season's games, fetched once and unpacked once for everything on the season page that reads them: the week strip near the top and the calendar of
 * games at the foot. The games are most of the page's data (a season is two thousand games), so the page does not carry them: the browser fetches them
 * from the season's `rows/games` address as soon as the page is up (kept JSON, a day), and the two parts show a short wait until they come. The
 * server-drawn parts of the page go through as children.
 */
export function SeasonGamesProvider({ seasonPath, children }: { seasonPath: string; children: React.ReactNode }) {
  const { state, data } = useFetchedJson<SeasonGamesView>(seasonGamesPath(seasonPath), "view", true);
  const games = useMemo(() => (data ? unpackGames(data.games) : NONE), [data]);
  const teams = useMemo(() => (data ? new Map(data.teams.map((t) => [t.id, t])) : NO_TEAMS), [data]);
  const value = useMemo(() => ({ ready: !!data, failed: state === "failed", games, teams }), [data, state, games, teams]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The season's games and clubs from the nearest SeasonGamesProvider (empty, with `ready` false, until they have come). */
export function useSeasonGames(): SeasonGamesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSeasonGames needs a SeasonGamesProvider");
  return v;
}
