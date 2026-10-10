"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { abbrFor } from "@/lib/abbr";
import { atUtc, fmt, utc } from "@/lib/format";
import { SRC } from "@/lib/leagues";
import type { Loc } from "@/lib/loc";
import { recordParts, type RecordPart } from "@/lib/record";
import { resolveSelection, type ClubTeam, type Selection } from "@/lib/season";
import { tableOf, type ColumnSpec, type SortKey } from "@/lib/sort";
import type { RecordTotals, TeamGame } from "@/lib/teamSeason";
import { replaceQuery } from "@/lib/urlQuery";
import { Donut } from "./Donut";
import { GameCalendar } from "./GameCalendar";
import { verdictOf } from "./HomeRoadBars";
import { LocSwitch } from "./LocSwitch";
import { MonthFilter } from "./MonthFilter";
import { PhaseSwitch } from "./PhaseSwitch";
import { RunningLine } from "./RunningLine";
import { SortTable } from "./SortTable";
import { SplitBars } from "./SplitBars";
import { Badge, TeamLink } from "./ui";
import "./team.css";

interface Props {
  lg: string;
  /** Label of the season: 2025, or 2005-06. */
  season: string;
  /** The season's year (2009 for 2009-10): the season page and the opponents' season pages are under it. */
  year: number;
  /** The team's id in this season's games (the calendar marks its wins and losses). */
  meId: number;
  games: TeamGame[];
  teams: ClubTeam[];
  record: RecordTotals;
  /** What the address asked for: ?phase=&month=&day= and ?sort=. */
  initial: Selection;
  initialSort: SortKey[];
  /** ?loc= : home, road or all. */
  initialLoc: Loc;
}

const PHASE_NAME = { p: "Playoffs", s: "Preseason", a: "All-Star" } as const;

/**
 * Everything on a team's season that follows its part-of-season switch: the record and game-by-game charts,
 * the sortable table of games, and the calendar of wins and losses. The selection and the sort live in the address.
 */
export function TeamSeasonView({ lg, season, year, meId, games, teams: teamList, record, initial, initialSort, initialLoc }: Props) {
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const [want, setWant] = useState<Selection>(initial);
  const [loc, setLoc] = useState<Loc>(initialLoc);
  const { phase } = want;
  // The part of the season chosen, both sides of the ball; the home and road split is always drawn from these.
  const phaseRows = useMemo(() => games.filter((g) => !phase || g.ph === phase), [games, phase]);
  // The Home / Road / All choice on top of it: what every chart, the table and the calendar below show.
  const locRows = useMemo(() => phaseRows.filter((g) => loc === "all" || g.loc === (loc === "home" ? "Home" : "Away")), [phaseRows, loc]);
  const { byDay, months, month, day } = useMemo(() => resolveSelection(locRows.map((g) => g.tuple), want), [locRows, want]);
  // The Month filter is only what was asked for; the calendar falls back to the last month with games.
  const filterMonth = months.includes(want.month) ? want.month : "";
  const rows = useMemo(() => (filterMonth ? locRows.filter((g) => g.date.startsWith(filterMonth)) : locRows), [locRows, filterMonth]);
  const gameDays = useMemo(() => new Set(locRows.map((g) => g.date)), [locRows]);

  useEffect(() => {
    replaceQuery({ phase: phase !== "r" ? phase : null, loc: loc !== "all" ? loc : null, month: filterMonth || null, day: day || null });
  }, [phase, loc, filterMonth, day]);

  const set = (patch: Partial<Selection>) => setWant({ ...want, ...patch });
  const extra = lg === "mlb" ? "Extras" : "OT";

  const specs = useMemo((): ColumnSpec<TeamGame>[] => [
    {
      key: "date", label: "Date", rest: "game_date", cls: "seasoncell", get: (g) => g.date,
      cell: (g) => (
        <>
          <Link href={`/${lg}/${year}?month=${g.date.slice(0, 7)}&day=${g.date}${g.ph !== "r" ? `&phase=${g.ph}` : ""}`} prefetch={false}
            title={`Every ${lg.toUpperCase()} game on ${utc.short(atUtc(g.date))}`}>{utc.dayName(atUtc(g.date))}</Link>
          {g.ph !== "r" ? <span className="badge tag">{PHASE_NAME[g.ph]}</span> : null}
        </>
      ),
    },
    { key: "loc", label: "H/A", title: "Home or away", get: (g) => g.loc },
    { key: "opp", label: "Opponent", cls: "team", get: (g) => g.oppName, cell: (g) => <TeamLink lg={lg} f={g.oppF} name={g.oppName} year={year} abbr={abbrFor(lg, g.oppF, year, g.oppName)} /> },
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
  ], [lg, year, extra]);
  const table = useMemo(() => tableOf(rows, specs, (g) => g.id), [rows, specs]);

  const done = rows.filter((g) => g.res);
  // The donut is the season's own record unless a side of the ball is chosen, then it is counted from those games.
  const counted = (list: TeamGame[]): RecordTotals => ({
    w: list.filter((g) => g.res === "W").length, l: list.filter((g) => g.res === "L").length,
    t: list.filter((g) => g.res === "T").length, otl: list.filter((g) => g.res === "OTL").length,
  });
  const parts: RecordPart[] = recordParts(loc === "all" ? record : counted(locRows.filter((g) => g.ph === "r")));
  const side = (l: "Home" | "Away") => { const r = counted(phaseRows.filter((g) => g.loc === l)); const n = r.w + r.l + r.t + r.otl; return n ? (r.w + r.t / 2) / n : null; };
  const verdict = verdictOf(side("Home"), side("Away"));
  const word = loc === "home" ? " at home" : loc === "road" ? " on the road" : "";
  return (
    <>
      <section className="section">
        <h2>The season at a glance</h2>
        <div className="controls"><LocSwitch value={loc} onChange={setLoc} /></div>
        <div className="chartrow">
          <Donut title={`${season} record${word}`} sub="Regular season" parts={parts} />
          <div className="donutbox">
            <h3>Home and road</h3>
            <p className="note">Every game with a result in the part of the season chosen under Games, home and road side by side.</p>
            <SplitBars games={phaseRows} />
            {verdict ? <div className="verdict"><b>{verdict.head}</b><span>{verdict.sub}</span></div> : null}
          </div>
        </div>
        <h3>Wins minus losses, game by game</h3>
        <RunningLine games={locRows} />
      </section>
      <section className="section">
        <h2>Games</h2>
        <div className="controls">
          <PhaseSwitch phase={phase} onChange={(k) => set({ phase: k })} />
          <LocSwitch value={loc} onChange={setLoc} />
        </div>
        <MonthFilter months={months} month={filterMonth} days={gameDays} day={day}
          onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ month: d.slice(0, 7), day: d })} />
        <p className="note">{`${fmt(rows.length)} game${rows.length === 1 ? "" : "s"}, ${fmt(done.length)} with a result. Press a column to sort.`}</p>
        <div className="tablebox"><SortTable {...table} def="date.asc" initial={initialSort} remote /></div>
      </section>
      <section className="section">
        <h2>Calendar</h2>
        <p className="note">Green days are wins, red days losses. Pick a day to see its game.</p>
        {months.length ? (
          <GameCalendar lg={lg} year={year} teams={teams} byDay={byDay} months={months} month={month} day={day} team={String(meId)} dayOnly
            onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ day: d })}
            onJump={(d) => set({ month: d.slice(0, 7), day: d })} />
        ) : <div className="daylist"><p className="note">No games for this choice.</p></div>}
      </section>
    </>
  );
}
