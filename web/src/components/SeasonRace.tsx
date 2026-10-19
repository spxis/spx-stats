"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { standingsRace } from "@/lib/standingsRace";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { RaceClub } from "./StandingsRace";
import { useSeasonGames } from "./SeasonGamesData";
import { useSeen } from "./useSeen";

const StandingsRace = dynamic(() => import("./StandingsRace").then((m) => m.StandingsRace), { ssr: false });

/**
 * A season's standings race (components/StandingsRace.tsx) under its standings. It works out the weekly ranks from the season's games the
 * page already fetches (SeasonGamesProvider), and draws the chart in the browser when the reader gets near it: it is a drawing with its
 * words in a table, so the page carries none of it. A season with fewer than two weeks of games shows nothing.
 */
export function SeasonRace({ clubs, countsOtl, weekStart }: { clubs: Record<number, RaceClub>; countsOtl: boolean; weekStart: number }) {
  const { say } = useSpeaker();
  const { ready, failed, games } = useSeasonGames();
  const race = useMemo(() => (ready ? standingsRace(games, countsOtl, weekStart) : null), [ready, games, countsOtl, weekStart]);
  const hasTies = useMemo(() => games.some((g) => g[5] === "r" && g[6] === "f" && g[2] != null && g[2] === g[3]), [games]);
  const [box, seen] = useSeen<HTMLDivElement>();
  if (failed || (ready && !race)) return null;
  return (
    <div className="raceSection">
      <h3>{say("race.title")}</h3>
      <p className="note">{say("race.lede")}</p>
      <div ref={box} style={seen && race ? undefined : { minHeight: 420 }}>
        {seen && race ? <StandingsRace race={race} clubs={clubs} countsOtl={countsOtl} hasTies={hasTies} /> : null}
      </div>
    </div>
  );
}
