"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import { atUtc } from "@/lib/format";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { srcName } from "@/lib/leagues";
import type { Loc } from "@/lib/loc";
import { recordParts, type RecordPart } from "@/lib/record";
import { matchesResult, resultOptions, type ResultFilter } from "@/lib/resultFilter";
import { resolveSelection, type ClubTeam, type Selection } from "@/lib/season";
import { tableOf, type ColumnSpec, type SortKey } from "@/lib/sort";
import { playedInOrder, type RecordTotals, type TeamGame } from "@/lib/teamSeason";
import { replaceQuery } from "@/lib/urlQuery";
import { Donut } from "./Donut";
import { GameCalendar } from "./GameCalendar";
import { verdictOf } from "./HomeRoadBars";
import { useSpeaker } from "./i18n/LocaleProvider";
import { LocSwitch } from "./LocSwitch";
import { MonthFilter } from "./MonthFilter";
import { PhaseSwitch } from "./PhaseSwitch";
import { ResultSwitch } from "./ResultSwitch";
import { RunningLine } from "./RunningLine";
import { SortTable } from "./SortTable";
import { SplitBars } from "./SplitBars";
import { Badge, TeamLink } from "./ui";
import "./team.css";
import { seasonPath } from "@/lib/slug";

interface Props {
  lg: string;
  /** The league's team abbreviations from the database. */
  abbrs: AbbrMap;
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
  /** ?result= : win, loss, tie, otl or all. It narrows the games table only. */
  initialResult: ResultFilter;
}

const PHASE_NAME = { p: "phase.playoffs", s: "phase.preseason", a: "phase.allStar" } as const;

/**
 * Everything on a team's season that follows its part-of-season switch: the record and game-by-game charts,
 * the sortable table of games, and the calendar of wins and losses. The selection and the sort live in the address.
 */
export function TeamSeasonView({ lg, abbrs, season, year, meId, games, teams: teamList, record, initial, initialSort, initialLoc, initialResult }: Props) {
  const { say, plural, fmt, dt } = useSpeaker();
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const [want, setWant] = useState<Selection>(initial);
  const [loc, setLoc] = useState<Loc>(initialLoc);
  const [wantResult, setResult] = useState<ResultFilter>(initialResult);
  const { phase } = want;
  const resultChoices = useMemo(() => resultOptions(games), [games]);
  const result = resultChoices.includes(wantResult) ? wantResult : "all";
  // The part of the season chosen, both sides of the ball; the home and road split is always drawn from these.
  const phaseRows = useMemo(() => games.filter((g) => !phase || g.ph === phase), [games, phase]);
  // The Home / Road / All choice on top of it: what every chart, the table and the calendar below show.
  const locRows = useMemo(() => phaseRows.filter((g) => loc === "all" || g.loc === (loc === "home" ? "Home" : "Away")), [phaseRows, loc]);
  const { byDay, months, month, day } = useMemo(() => resolveSelection(locRows.map((g) => g.tuple), want), [locRows, want]);
  // The Month filter is only what was asked for; the calendar falls back to the last month with games.
  const filterMonth = months.includes(want.month) ? want.month : "";
  // The Result choice only narrows the table: the charts, the calendar and the game numbers keep counting every game of the selection above.
  const rows = useMemo(() => locRows.filter((g) => (!filterMonth || g.date.startsWith(filterMonth)) && matchesResult(g, result)), [locRows, filterMonth, result]);
  const gameDays = useMemo(() => new Set(locRows.map((g) => g.date)), [locRows]);

  useEffect(() => {
    replaceQuery({ phase: phase !== "r" ? phase : null, loc: loc !== "all" ? loc : null, result: result !== "all" ? result : null, month: filterMonth || null, day: day || null });
  }, [phase, loc, result, filterMonth, day]);

  const set = (patch: Partial<Selection>) => setWant({ ...want, ...patch });
  const extra = say(lg === "mlb" ? "col.extras" : "col.ot");

  const numbers = useMemo(() => new Map(playedInOrder(locRows).map((g, i) => [g.id, i + 1])), [locRows]);

  const specs = useMemo((): ColumnSpec<TeamGame>[] => [
    { key: "n", label: say("col.gameNo"), num: true, title: say("col.gameNoTitle"), get: (g) => numbers.get(g.id) ?? null, cell: (g) => numbers.get(g.id) ?? "" },
    {
      key: "date", label: say("col.date"), rest: "game_date", cls: "seasoncell", get: (g) => g.date,
      cell: (g) => (
        <>
          <Link href={`${seasonPath(lg, year)}?month=${g.date.slice(0, 7)}&day=${g.date}${g.ph !== "r" ? `&phase=${g.ph}` : ""}`} prefetch={false}
            title={say("tseason.dayGames", { league: lg.toUpperCase(), date: dt.short(atUtc(g.date)) })}>{dt.dayName(atUtc(g.date))}</Link>
          {g.ph !== "r" ? <span className="badge tag">{say(PHASE_NAME[g.ph])}</span> : null}
        </>
      ),
    },
    { key: "loc", label: say("col.ha"), title: say("col.haTitle"), get: (g) => g.loc, cell: (g) => say(g.loc === "Home" ? "loc.home" : "loc.away") },
    { key: "opp", label: say("col.opponent"), cls: "team", get: (g) => g.oppName, cell: (g) => <TeamLink lg={lg} f={g.oppF} name={g.oppName} year={year} abbr={abbrFor(abbrs, g.oppF, year, g.oppName)} /> },
    { key: "score", label: say("col.score"), num: true, title: say("col.scoreTitle"), get: (g) => g.margin, cell: (g) => (g.res ? `${g.mine}–${g.theirs}` : "") },
    {
      key: "res", label: say(lg === "nhl" ? "col.wlt" : "col.result"), get: (g) => g.res || null,
      cell: (g) => (g.res ? <span className={g.res === "W" ? "ok" : g.res === "T" ? undefined : "bad"}>{say(RESULT_KEY[g.res])}</span> : <span className="note">{say("game.noResult")}</span>),
    },
    { key: "ot", label: extra, title: say(lg === "mlb" ? "col.extrasTitle" : "col.otTitle"), get: (g) => (g.ot ? 1 : 0), cell: (g) => (g.ot ? extra : "") },
    { key: "rec", label: say("col.record"), num: true, title: say("col.recordTitle"), get: (g) => g.recPct, cell: (g) => g.rec },
    {
      key: "src", label: say("col.source"), get: (g) => srcName(say, g.src),
      cell: (g) => (
        <>
          <Badge src={g.src} />
          {g.v === 1 ? <span className="ok tag" title={say("game.confirmedTitle")}>✓</span> : null}
          {g.v === -1 ? <span className="bad tag" title={say("game.disputedTitle")}>≠</span> : null}
        </>
      ),
    },
  ], [lg, abbrs, year, extra, numbers, say, dt]);
  const table = useMemo(() => tableOf(rows, specs, (g) => g.id), [rows, specs]);

  const done = rows.filter((g) => g.res);
  // The donut is the season's own record unless a side of the ball is chosen, then it is counted from those games.
  const counted = (list: TeamGame[]): RecordTotals => ({
    w: list.filter((g) => g.res === "W").length, l: list.filter((g) => g.res === "L").length,
    t: list.filter((g) => g.res === "T").length, otl: list.filter((g) => g.res === "OTL").length,
  });
  const parts: RecordPart[] = recordParts(loc === "all" ? record : counted(locRows.filter((g) => g.ph === "r")));
  const side = (l: "Home" | "Away") => { const r = counted(phaseRows.filter((g) => g.loc === l)); const n = r.w + r.l + r.t + r.otl; return n ? (r.w + r.t / 2) / n : null; };
  const verdict = verdictOf(side("Home"), side("Away"), say);
  const recordKey = loc === "home" ? "glance.recordHome" : loc === "road" ? "glance.recordRoad" : "glance.record";
  return (
    <>
      <section className="section">
        <h2>{say("glance.title")}</h2>
        <div className="controls"><LocSwitch value={loc} onChange={setLoc} /></div>
        <div className="chartrow">
          <Donut title={say(recordKey, { season })} sub={say("phase.regular")} parts={parts} />
          <div className="donutbox">
            <h3>{say("glance.homeRoad")}</h3>
            <p className="note">{say("glance.homeRoadNote")}</p>
            <SplitBars games={phaseRows} />
            {verdict ? <div className="verdict"><b>{verdict.head}</b><span>{verdict.sub}</span></div> : null}
          </div>
        </div>
        <h3>{say("glance.running")}</h3>
        <RunningLine games={locRows} />
      </section>
      <section className="section">
        <h2>{say("teamgames.title")}</h2>
        <div className="controls">
          <PhaseSwitch phase={phase} onChange={(k) => set({ phase: k })} />
          <LocSwitch value={loc} onChange={setLoc} />
          <ResultSwitch value={result} options={resultChoices} onChange={setResult} />
        </div>
        <MonthFilter months={months} month={filterMonth} days={gameDays} day={day}
          onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ month: d.slice(0, 7), day: d })} />
        <p className="note">{say("teamgames.note", { games: plural("count.games", rows.length), finals: fmt(done.length) })}</p>
        <div className="tablebox"><SortTable {...table} def="date.asc" initial={initialSort} remote /></div>
      </section>
      <section className="section">
        <h2>{say("teamcal.title")}</h2>
        <p className="note">{say("teamcal.note")}</p>
        {months.length ? (
          <GameCalendar lg={lg} abbrs={abbrs} year={year} teams={teams} byDay={byDay} months={months} month={month} day={day} team={String(meId)} dayOnly
            onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ day: d })}
            onJump={(d) => set({ month: d.slice(0, 7), day: d })} />
        ) : <div className="daylist"><p className="note">{say("games.none")}</p></div>}
      </section>
    </>
  );
}
