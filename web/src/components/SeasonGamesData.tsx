"use client";

import { createContext, useContext, useMemo } from "react";
import { unpackGames, type PackedGames } from "@/lib/gamesCodec";
import type { ClubTeam, GameTuple } from "@/lib/season";

interface SeasonGamesValue { games: GameTuple[]; teams: Map<number, ClubTeam> }

const Ctx = createContext<SeasonGamesValue | null>(null);

/**
 * A season's games, sent once and unpacked once for everything on the season page that reads them: the week strip near the top and the calendar of
 * games at the foot (the games are most of the page's data, so two copies would double it). The server-drawn parts of the page go through as children.
 */
export function SeasonGamesProvider({ games: packed, teams: teamList, children }: { games: PackedGames; teams: ClubTeam[]; children: React.ReactNode }) {
  const games = useMemo(() => unpackGames(packed), [packed]);
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const value = useMemo(() => ({ games, teams }), [games, teams]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The season's games and clubs from the nearest SeasonGamesProvider. */
export function useSeasonGames(): SeasonGamesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSeasonGames needs a SeasonGamesProvider");
  return v;
}
