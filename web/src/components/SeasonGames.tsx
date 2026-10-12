"use client";

import { useEffect, useMemo, useState } from "react";
import type { AbbrMap } from "@/lib/abbr";
import { resolveSelection, type ClubTeam, type GameTuple, type Selection } from "@/lib/season";
import { replaceQuery } from "@/lib/urlQuery";
import { GameCalendar } from "./GameCalendar";
import { useSpeaker } from "./i18n/LocaleProvider";
import { Rich } from "./i18n/Rich";
import { PhaseSwitch } from "./PhaseSwitch";
import { TeamLogo } from "./TeamLogo";

/**
 * The games of a season: part-of-season buttons, a team filter, a month calendar shaded by games held
 * (or by the team's result on its days), and the games of the chosen day or month.
 * The selection lives in the address (?phase=&team=&month=&day=), so a reload or shared link keeps it.
 */
export function SeasonGames({ lg, abbrs, year, games, teams: teamList, initial, children }: { lg: string; abbrs: AbbrMap; year?: number; games: GameTuple[]; teams: ClubTeam[]; initial: Selection; children?: React.ReactNode }) {
  const { say } = useSpeaker();
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const [want, setWant] = useState<Selection>(initial);
  const { byDay, months, month, day } = useMemo(() => resolveSelection(games, want), [games, want]);
  const { phase, team } = want;

  // Keep the address in step with what is shown (the same query the server read); other keys such as ?sort= stay.
  useEffect(() => {
    replaceQuery({ phase: phase !== "r" ? phase : null, team: team || null, month: month || null, day: day || null });
  }, [phase, team, month, day]);

  const set = (patch: Partial<Selection>) => setWant({ phase, team, month, day, ...patch });

  const chosen = teams.get(Number(team));
  const heading = (
    <>
      <h2>{chosen
        ? <Rich text={say("games.titleTeam")} parts={{ team: <span className="gamesteam"><TeamLogo url={chosen.logo} size={24} />{chosen.name}</span> }} />
        : say("season.games")}</h2>
      {children}
    </>
  );
  const controls = (
    <div className="controls">
      <PhaseSwitch phase={phase} onChange={(k) => set({ phase: k })} />
      <select aria-label={say("games.team")} value={team} onChange={(e) => set({ team: e.target.value })}>
        <option value="">{say("games.allTeams")}</option>
        {teamList.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
      </select>
    </div>
  );

  if (!months.length) {
    return (
      <>
        {heading}
        {controls}
        <div className="daylist"><p className="note">{say("games.none")}</p></div>
      </>
    );
  }

  return (
    <>
      {heading}
      {controls}
      <GameCalendar lg={lg} abbrs={abbrs} year={year} teams={teams} byDay={byDay} months={months} month={month} day={day} team={team}
        onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ day: d })}
        onJump={(d) => set({ month: d.slice(0, 7), day: d })} />
    </>
  );
}
