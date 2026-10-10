"use client";

import { useEffect, useMemo, useState } from "react";
import { atUtc, fmt, utc } from "@/lib/format";
import { SRC } from "@/lib/leagues";
import { recordParts, type RecordPart } from "@/lib/record";
import { resolveSelection, type ClubTeam, type Selection } from "@/lib/season";
import { tableOf, type ColumnSpec, type SortKey } from "@/lib/sort";
import type { RecordTotals, TeamGame } from "@/lib/teamSeason";
import { replaceQuery } from "@/lib/urlQuery";
import { Donut } from "./Donut";
import { GameCalendar } from "./GameCalendar";
import { PhaseSwitch } from "./PhaseSwitch";
import { RunningLine } from "./RunningLine";
import { SortTable } from "./SortTable";
import { SplitBars } from "./SplitBars";
import { Badge, TeamLink } from "./ui";

interface Props {
  lg: string;
  /** Label of the season: 2025, or 2005-06. */
  season: string;
  /** The team's id in this season's games (the calendar marks its wins and losses). */
  meId: number;
  games: TeamGame[];
  teams: ClubTeam[];
  record: RecordTotals;
  /** What the address asked for: ?phase=&month=&day= and ?sort=. */
  initial: Selection;
  initialSort: SortKey[];
}

const PHASE_NAME = { p: "Playoffs", s: "Preseason", a: "All-Star" } as const;

/**
 * Everything on a team's season that follows its part-of-season switch: the record and game-by-game charts,
 * the sortable table of games, and the calendar of wins and losses. The selection and the sort live in the address.
 */
export function TeamSeasonView({ lg, season, meId, games, teams: teamList, record, initial, initialSort }: Props) {
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const [want, setWant] = useState<Selection>(initial);
  const { phase } = want;
  const rows = useMemo(() => games.filter((g) => !phase || g.ph === phase), [games, phase]);
  const { byDay, months, month, day } = useMemo(() => resolveSelection(rows.map((g) => g.tuple), want), [rows, want]);

  useEffect(() => {
    replaceQuery({ phase: phase !== "r" ? phase : null, month: month || null, day: day || null });
  }, [phase, month, day]);

  const set = (patch: Partial<Selection>) => setWant({ ...want, ...patch });
  const extra = lg === "mlb" ? "Extras" : "OT";

  const specs = useMemo((): ColumnSpec<TeamGame>[] => [
    {
      key: "date", label: "Date", rest: "game_date", cls: "seasoncell", get: (g) => g.date,
      cell: (g) => <>{utc.dayName(atUtc(g.date))}{g.ph !== "r" ? <span className="badge tag">{PHASE_NAME[g.ph]}</span> : null}</>,
    },
    { key: "loc", label: "H/A", title: "Home or away", get: (g) => g.loc },
    { key: "opp", label: "Opponent", cls: "team", get: (g) => g.oppName, cell: (g) => <TeamLink lg={lg} f={g.oppF} name={g.oppName} /> },
    { key: "score", label: "Score", num: true, title: "This team first. Sorted by margin.", get: (g) => g.margin, cell: (g) => (g.res ? `${g.mine}–${g.theirs}` : "") },
    {
      key: "res", label: lg === "nhl" ? "W/L/T" : "Result", get: (g) => g.res || null,
      cell: (g) => (g.res ? <span className={g.res === "W" ? "ok" : g.res === "T" ? undefined : "bad"}>{g.res}</span> : <span className="note">no result</span>),
    },
    { key: "ot", label: extra, title: lg === "mlb" ? "Went to extra innings" : "Went to overtime", get: (g) => (g.ot ? 1 : 0), cell: (g) => (g.ot ? extra : "") },
    { key: "rec", label: "Record", num: true, title: "Record after the game, within its part of the season", get: (g) => g.recPct, cell: (g) => g.rec },
    {
      key: "src", label: "Source", get: (g) => SRC[g.src] || g.src,
      cell: (g) => (
        <>
          <Badge src={g.src} />
          {g.v === 1 ? <span className="ok tag" title="Confirmed by a second source">✓</span> : null}
          {g.v === -1 ? <span className="bad tag" title="A second source disagrees">≠</span> : null}
        </>
      ),
    },
  ], [lg, extra]);
  const table = useMemo(() => tableOf(rows, specs, (g) => g.id), [rows, specs]);

  const done = rows.filter((g) => g.res);
  const parts: RecordPart[] = recordParts(record);
  return (
    <>
      <section className="section">
        <h2>The season at a glance</h2>
        <div className="chartrow">
          <Donut title={`${season} record`} sub="Regular season" parts={parts} />
          <div className="donutbox">
            <h3>Home and road</h3>
            <p className="note">Every game with a result in the part of the season chosen below.</p>
            <SplitBars games={rows} />
          </div>
        </div>
        <h3>Wins minus losses, game by game</h3>
        <RunningLine games={rows} />
      </section>
      <section className="section">
        <h2>Games</h2>
        <div className="controls"><PhaseSwitch phase={phase} onChange={(k) => set({ phase: k })} /></div>
        <p className="note">{`${fmt(rows.length)} game${rows.length === 1 ? "" : "s"}, ${fmt(done.length)} with a result. Press a column to sort.`}</p>
        <div className="tablebox"><SortTable {...table} def="date.asc" initial={initialSort} remote /></div>
      </section>
      <section className="section">
        <h2>Calendar</h2>
        <p className="note">Green days are wins, red days losses. Pick a day to see its game.</p>
        {months.length ? (
          <GameCalendar lg={lg} teams={teams} byDay={byDay} months={months} month={month} day={day} team={String(meId)} dayOnly
            onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ day: d })} />
        ) : <div className="daylist"><p className="note">No games for this choice.</p></div>}
      </section>
    </>
  );
}
