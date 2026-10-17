"use client";

import Link from "@/components/Link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { abbrFor, officialAbbr, type AbbrMap } from "@/lib/abbr";
import { atUtc, localToday } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { srcName } from "@/lib/leagues";
import type { Loc } from "@/lib/loc";
import { recordParts, type RecordPart } from "@/lib/record";
import { matchesResult, resultOptions, type ResultFilter } from "@/lib/resultFilter";
import { openMonth, resolveSelection, type ClubTeam, type Selection } from "@/lib/season";
import { tableOf, type ColumnSpec, type SortKey } from "@/lib/sort";
import { heatGamesFromTeam } from "@/lib/resultHeat";
import { playedInOrder, type RecordTotals, type TeamGame } from "@/lib/teamSeason";
import { replaceQuery } from "@/lib/urlQuery";
import { Donut } from "./Donut";
import { ResultHeat } from "./ResultHeat";
import { GameCalendar } from "./GameCalendar";
import { H2hLink } from "./H2hLink";
import { verdictOf } from "./HomeRoadBars";
import { useSpeaker } from "./i18n/LocaleProvider";
import { LocSwitch } from "./LocSwitch";
import { MonthFilter } from "./MonthFilter";
import { OfficialLinks } from "./OfficialLinks";
import { PhaseSwitch } from "./PhaseSwitch";
import { ResultSwitch } from "./ResultSwitch";
import { createRowLink } from "./rowLink";
import { RunningLine } from "./RunningLine";
import { SortTable } from "./SortTable";
import { SplitBars } from "./SplitBars";
import { TeamLabel } from "./TeamLabel";
import { Badge } from "./ui";
import "./team.css";
import "./game.css";
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
  /** The previous and next season links, shown again beside the games and the calendar. */
  seasonNav?: ReactNode;
  /** The server's date (YYYY-MM-DD): what the calendar's first month is worked out from until the reader's own clock is read. */
  today: string;
}

const PHASE_NAME = { p: "phase.playoffs", s: "phase.preseason", a: "phase.allStar" } as const;

/**
 * Everything on a team's season that follows its part-of-season switch: the record and game-by-game charts,
 * the sortable table of games, and the calendar of wins and losses. The selection and the sort live in the address.
 */
export function TeamSeasonView({ lg, abbrs, season, year, meId, games, teams: teamList, record, initial, initialSort, initialLoc, initialResult, seasonNav, today }: Props) {
  const { say, plural, fmt, dt } = useSpeaker();
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const logos = useMemo(() => new Map(teamList.map((t) => [t.f, t.logo])), [teamList]);
  const [link] = useState(createRowLink);
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
  const resolved = useMemo(() => resolveSelection(locRows.map((g) => g.tuple), want), [locRows, want]);
  const { byDay, months, day } = resolved;
  // With no month asked for, the calendar opens on today's month while the season is under way. The server's date is what the
  // page is first drawn with, so the two agree until the reader's own clock takes over.
  const now = useSyncExternalStore(() => () => {}, localToday, () => today);
  const month = months.includes(want.month) ? resolved.month : (openMonth(months, now) ?? resolved.month);
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
    { key: "opp", label: say("col.opponent"), cls: "team", get: (g) => g.oppName, cell: (g) => <><TeamLabel lg={lg} f={g.oppF} name={g.oppName} year={year} abbr={abbrFor(abbrs, g.oppF, year, g.oppName)} logo={logos.get(g.oppF)} /><H2hLink lg={lg} year={year} a={teams.get(meId)?.f} b={g.oppF} /></> },
    {
      key: "score", label: say("col.score"), num: true, title: say("col.scoreTitle"), get: (g) => g.margin,
      cell: (g) => {
        const me = teams.get(meId)?.name ?? null, [away, home] = g.loc === "Home" ? [g.oppName, me] : [me, g.oppName];
        return (
          <>
            <Link className="scorelink" href={gamePath(lg, year, g.id, away, home)} prefetch={false} title={say("gm.viewGameTitle", { away: away ?? "—", home: home ?? "—" })}>
              {g.res ? `${g.mine}–${g.theirs}` : say("gm.viewGame")}
            </Link>
            <OfficialLinks league={lg} date={g.date} away={g.loc === "Home" ? officialAbbr(abbrs, g.oppF, year) : officialAbbr(abbrs, teams.get(meId)?.f, year)} home={g.loc === "Home" ? officialAbbr(abbrs, teams.get(meId)?.f, year) : officialAbbr(abbrs, g.oppF, year)} awayName={away} homeName={home} year={year} phase={g.ph === "p" ? "playoffs" : g.ph === "s" ? "preseason" : g.ph === "a" ? "all_star" : "regular"} nhlId={g.nhlId} nflWeek={g.nflWeek} retroBox={g.retroBox} status={g.status} startsAt={g.startsAt} box={say("scores.box")} notes={say("scores.notes")} day={say("scores.dayScores")} />
          </>
        );
      },
    },
    {
      key: "res", label: say(lg === "nhl" ? "col.wlt" : "col.result"), get: (g) => g.res || null,
      cell: (g) => (g.res ? <span className={g.res === "W" ? "ok" : g.res === "T" ? undefined : "bad"}>{say(RESULT_KEY[g.res])}</span> : <span className="note">{say(g.tuple[6] === "s" ? "game.scheduled" : "game.noResult")}</span>),
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
  ], [lg, abbrs, year, extra, numbers, say, dt, teams, meId, logos]);
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
  const heatGames = useMemo(() => heatGamesFromTeam(games, year, teams.get(meId)?.name ?? null), [games, year, teams, meId]);
  return (
    <>
      {heatGames.length ? (
        <section className="section">
          <h2>{say("rheat.title")}</h2>
          <p className="note">{say("rheat.lede")}</p>
          <ResultHeat lg={lg} games={heatGames} />
        </section>
      ) : null}
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
        <RunningLine games={locRows} link={link} />
      </section>
      <section className="section">
        <div className="sechead"><h2>{say("teamgames.title")}</h2>{seasonNav}</div>
        <div className="controls">
          <PhaseSwitch phase={phase} onChange={(k) => set({ phase: k })} />
          <LocSwitch value={loc} onChange={setLoc} />
          <ResultSwitch value={result} options={resultChoices} onChange={setResult} />
        </div>
        <MonthFilter months={months} month={filterMonth} days={gameDays} day={day}
          onMonth={(m) => set({ month: m, day: "" })} onDay={(d) => set({ month: d.slice(0, 7), day: d })} />
        <p className="note">{say("teamgames.note", { games: plural("count.games", rows.length), finals: fmt(done.length) })}</p>
        <div className="tablebox"><SortTable {...table} def="date.asc" initial={initialSort} remote link={link} /></div>
      </section>
      <section className="section">
        <div className="sechead"><h2>{say("teamcal.title")}</h2>{seasonNav}</div>
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
