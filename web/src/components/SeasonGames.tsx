"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AbbrMap } from "@/lib/abbr";
import { localToday } from "@/lib/format";
import { resolveSelection, type Selection } from "@/lib/season";
import { replaceQuery } from "@/lib/urlQuery";
import { GameCalendar } from "./GameCalendar";
import { useSpeaker } from "./i18n/LocaleProvider";
import { Rich } from "./i18n/Rich";
import { PhaseSwitch } from "./PhaseSwitch";
import { useSeasonGames } from "./SeasonGamesData";
import { TeamLogo } from "./TeamLogo";

/**
 * The games of a season: part-of-season buttons, a team filter, a month calendar shaded by games held
 * (or by the team's result on its days), and the games of the chosen day or month.
 * The games come packed (lib/gamesCodec.ts) from the season's `rows/games` address and are unpacked once, by the SeasonGamesProvider around the page (the week strip reads them too); until they have come the part says it is loading. The selection lives in the address (?phase=&team=&month=&day=), so a reload or shared link keeps it.
 */
export function SeasonGames({ lg, abbrs, year, initial, groupFilter = false, children }: { lg: string; abbrs: AbbrMap; year?: number; initial: Selection; groupFilter?: boolean; children?: React.ReactNode }) {
  const { say } = useSpeaker();
  const { ready, failed, games, teams } = useSeasonGames();
  const teamList = useMemo(() => [...teams.values()], [teams]);
  const [want, setWant] = useState<Selection>(initial);
  const today = useSyncExternalStore(() => () => {}, localToday, () => "");
  const { byDay, months, month, day, weeks, week, shownWeek } = useMemo(() => resolveSelection(games, want, today), [games, want, today]);
  const { phase, team } = want;

  // Keep the address in step with what is shown (the same query the server read); other keys such as ?sort= stay.
  useEffect(() => {
    if (!ready) return; // until the games have come the month and day are unknown, and the address must keep what it holds
    replaceQuery({ phase: phase !== "r" ? phase : null, team: team || null, month: month || null, day: day || null, week: week || null });
  }, [ready, phase, team, month, day, week]);

  const set = (patch: Partial<Selection>) => setWant({ phase, team, month, day, week, ...patch });

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

  if (!ready) {
    return (
      <>
        {heading}
        <div className="daylist"><p className="note" role="status">{failed ? say("load.failed") : say("load.loading")}</p></div>
      </>
    );
  }

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
        weeks={weeks} week={shownWeek} onWeek={(w) => set({ week: w, day: "" })} note={groupFilter ? say("games.allGroups") : undefined}
        onMonth={(m) => set({ month: m, day: "", week: "" })} onDay={(d) => set({ day: d })}
        onJump={(d) => set({ month: d.slice(0, 7), day: d, week: "" })} />
    </>
  );
}
