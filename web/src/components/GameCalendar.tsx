"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import { atUtc, isoDay, localToday } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import type { Speaker } from "@/lib/i18n/i18n";
import { RESULT_KEY } from "@/lib/i18n/keys";
import type { ClubTeam, GameTuple } from "@/lib/season";
import { DatePicker } from "./DatePicker";
import { useSpeaker } from "./i18n/LocaleProvider";
import { Rich } from "./i18n/Rich";
import { TeamLabel } from "./TeamLabel";
import { TeamLogo } from "./TeamLogo";
import { Badge } from "./ui";
import "./team.css";
import "./game.css";

/** How many games of the list the server draws; the rest are added when the page is live. */
const FIRST_GAMES = 16;

function GameRow({ lg, g, teams, year, abbrs }: { lg: string; g: GameTuple; teams: Map<number, ClubTeam>; year?: number; abbrs: AbbrMap }) {
  const { say } = useSpeaker();
  const [, a, as, hs, h, , st, src, ot, v, gid] = g;
  const fin = st === "f";
  const aw = fin && (as ?? 0) > (hs ?? 0), hw = fin && (hs ?? 0) > (as ?? 0);
  const nm = (id: number) => teams.get(id)?.name || "—";
  const ab = (id: number) => abbrFor(abbrs, teams.get(id)?.f, year, teams.get(id)?.name);
  const text = fin ? `${as}–${hs}${ot ? " " + say(lg === "mlb" ? "game.extras" : "game.ot") : ""}` : say("game.noResult");
  return (
    <div className="game">
      <span>
        <Rich text={say("game.at")} parts={{
          away: <TeamLabel lg={lg} f={teams.get(a)?.f} name={nm(a)} year={year} abbr={ab(a)} className={aw ? "won" : undefined} logo={teams.get(a)?.logo} />,
          home: <TeamLabel lg={lg} f={teams.get(h)?.f} name={nm(h)} year={year} abbr={ab(h)} className={hw ? "won" : undefined} logo={teams.get(h)?.logo} />,
        }} />
      </span>
      <span className="score">
        {year != null
          ? <Link className="scorelink" href={gamePath(lg, year, gid, nm(a), nm(h))} prefetch={false} title={say("gm.viewGameTitle", { away: nm(a), home: nm(h) })}>{text}</Link>
          : text}
      </span>
      <span className="meta">
        <Badge src={src} />
        {v === 1 ? <span className="ok" title={say("game.confirmedTitle")}>{"✓ " + say("game.confirmed")}</span> : null}
        {v === -1 ? <span className="bad" title={say("game.disputedTitle")}>{"≠ " + say("game.disputed")}</span> : null}
      </span>
    </div>
  );
}

/** A team's result on a day: W, L or T and the score; N when the game has no result. */
function result(list: GameTuple[], team: string, say: Speaker["say"]): { r: "W" | "L" | "T" | "N"; letter: string; score: string; opp: number; home: boolean } {
  const g = list[0];
  const home = String(g[4]) === team, opp = home ? g[1] : g[4];
  if (!g || g[6] !== "f") return { r: "N", letter: "", score: "·", opp, home };
  const mine = (home ? g[3] : g[2]) ?? 0, theirs = (home ? g[2] : g[3]) ?? 0;
  const r = mine > theirs ? "W" : mine < theirs ? "L" : "T";
  return { r, letter: say(RESULT_KEY[r]), score: `${mine}–${theirs}`, opp, home };
}

interface Props {
  lg: string;
  /** The league's team abbreviations from the database. */
  abbrs: AbbrMap;
  /** The season's year: team links open that team's season, and abbreviations are the ones in use that year. */
  year?: number;
  teams: Map<number, ClubTeam>;
  /** The games to show by day, the months that hold any, and the month and day chosen (settled by resolveSelection). */
  byDay: Map<string, GameTuple[]>;
  months: string[];
  month: string;
  day: string;
  /** A team id: its days are marked W, L or T with the score instead of a count of games. */
  team?: string;
  /** List the games only for a day that has been picked (a team's season already lists them in its table). */
  dayOnly?: boolean;
  onMonth: (month: string) => void;
  onDay: (day: string) => void;
  /** Offers a date picker that jumps to a day (month and day together); the days with games are marked. */
  onJump?: (day: string) => void;
}

/**
 * The month calendar shared by the season page and a team's season: each day shaded by how many games it held,
 * or by the team's result on its days, with the games of the chosen day or month beneath it.
 */
export function GameCalendar({ lg, abbrs, year, teams, byDay, months, month, day, team = "", dayOnly = false, onMonth, onDay, onJump }: Props) {
  const { say, plural, dt } = useSpeaker();
  const today = useSyncExternalStore(() => () => {}, localToday, () => "");
  const monthsRef = useRef<HTMLDivElement>(null);
  const first = atUtc(`${month}-01`);
  const most = Math.max(1, ...[...byDay.values()].map((l) => l.length));
  const cells = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push(<span key={`b${i}`} className="cell blank" />);
  for (const d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = isoDay(d), list = byDay.get(key) ?? [];
    const dn = <span className="dn">{d.getUTCDate()}</span>;
    if (!list.length) { cells.push(<span key={key} className="cell">{dn}</span>); continue; }
    const res = team ? result(list, team, say) : null;
    const opp = res ? `${res.home ? "" : "@"}${abbrFor(abbrs, teams.get(res.opp)?.f, year, teams.get(res.opp)?.name)}` : "";
    cells.push(
      <button key={key} type="button" className={"cell has" + (res ? ` res ${res.r}` : "") + (key === day ? " on" : "")}
        style={{ "--heat": `${Math.round(18 + (62 * list.length) / most)}%` } as React.CSSProperties}
        aria-label={say("cal.dayAria", { date: dt.monthDay(d), games: plural("count.games", list.length) }) + (res ? say(res.home ? "cal.vsOpp" : "cal.atOpp", { opp: teams.get(res.opp)?.name ?? say("cal.oppFallback") }) : "")} aria-pressed={key === day}
        onClick={() => onDay(key === day ? "" : key)}>
        {dn}
        {res ? (
          <>
            <span className={"rtop " + res.r}>{res.letter}</span>
            <span className="opab" title={teams.get(res.opp)?.name ?? undefined}><TeamLogo url={teams.get(res.opp)?.logo} size={20} />{opp}</span>
            <span className={"mk " + (res.r === "N" ? "" : res.r)}>{res.letter ? <span className="rl">{res.letter + " "}</span> : null}{res.score}</span>
          </>
        ) : <span className="ct">{list.length}</span>}
      </button>,
    );
  }

  const mi = months.indexOf(month);
  useEffect(() => {
    const box = monthsRef.current, chip = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && chip) box.scrollLeft = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
  }, [month]);
  const shown = day
    ? [[day, byDay.get(day) ?? []] as const]
    : [...byDay].filter(([k]) => k.slice(0, 7) === month).sort((a, b) => a[0].localeCompare(b[0]));
  const n = shown.reduce((a, [, l]) => a + l.length, 0);
  // The page is drawn once for everyone and a month of baseball is 450 rows of 1 KB; the server's (and the first client) render lists the first days' games only, and the
  // rest follow once the page is live (the data is already here). The count in the note above is the month's whole.
  const live = useSyncExternalStore(() => () => {}, () => true, () => false);
  const listed: (readonly [string, GameTuple[]])[] = [];
  for (let room = live ? Infinity : FIRST_GAMES, i = 0; room > 0 && i < shown.length; i++) {
    const part = shown[i][1].slice(0, room);
    room -= part.length;
    listed.push([shown[i][0], part]);
  }
  const monthFmt = months.length > 12 ? dt.monYear : dt.mon;
  const dayKeys = [...byDay.keys()].sort(), dayMin = dayKeys[0], dayMax = dayKeys.at(-1) ?? "";

  return (
    <>
      {onJump && byDay.size ? (
        <div className="calpick">
          <DatePicker label={say("cal.jump")} value={day} min={dayMin} max={dayMax}
            marked={new Set(byDay.keys())} placeholder={say("cal.jumpPlaceholder")} onChange={(d) => { if (d) onJump(d); else onDay(""); }} />
          <button type="button" className="todaybtn" disabled={!today || today < dayMin || today > dayMax} onClick={() => onJump(today)}>{say("picker.today")}</button>
        </div>
      ) : null}
      <div className="cal">
        <div className="calhead">
          <button type="button" className="nav" disabled={mi === 0} aria-label={say("cal.prev")} onClick={() => onMonth(months[mi - 1])}>‹</button>
          <div className="months" ref={monthsRef}>
            {months.map((m) => (
              <button key={m} type="button" className="mo" aria-pressed={m === month} onClick={() => onMonth(m)}>{monthFmt(atUtc(`${m}-01`))}</button>
            ))}
          </div>
          <button type="button" className="nav" disabled={mi === months.length - 1} aria-label={say("cal.next")} onClick={() => onMonth(months[mi + 1])}>›</button>
        </div>
        <div className="grid">
          {dt.weekdays.map((w) => <span key={w} className="wd">{w}</span>)}
          {cells}
        </div>
      </div>
      <div className="daylist">
        {dayOnly && !day ? (
          <p className="note">{say("cal.pickGame", { month: dt.monthYear(first) })}</p>
        ) : (
          <>
            <p className="note">
              {day ? say("cal.dayNote", { date: dt.full(atUtc(day)), games: plural("count.games", n) }) : say("cal.monthNote", { month: dt.monthYear(first), games: plural("count.games", n) })}
              {day ? <button type="button" className="linkish" onClick={() => onDay("")}>{say("cal.showMonth")}</button> : null}
            </p>
            <div className="games">
              {listed.map(([date, list]) => (
                <div className="day" key={date}>
                  <h3>{dt.short(atUtc(date))}</h3>
                  {list.map((g, i) => <GameRow key={i} lg={lg} g={g} teams={teams} year={year} abbrs={abbrs} />)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
