"use client";

import { atUtc, utc } from "@/lib/format";
import { abbrFor } from "@/lib/abbr";
import type { ClubTeam, GameTuple } from "@/lib/season";
import { DatePicker } from "./DatePicker";
import { Badge, TeamLink } from "./ui";
import "./team.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function GameRow({ lg, g, teams, year }: { lg: string; g: GameTuple; teams: Map<number, ClubTeam>; year?: number }) {
  const [, a, as, hs, h, , st, src, ot, v] = g;
  const fin = st === "f";
  const aw = fin && (as ?? 0) > (hs ?? 0), hw = fin && (hs ?? 0) > (as ?? 0);
  const nm = (id: number) => teams.get(id)?.name || "—";
  const ab = (id: number) => abbrFor(lg, teams.get(id)?.f, year, teams.get(id)?.name);
  return (
    <div className="game">
      <span>
        <TeamLink lg={lg} f={teams.get(a)?.f} name={nm(a)} year={year} abbr={ab(a)} className={aw ? "won" : undefined} />
        {" at "}
        <TeamLink lg={lg} f={teams.get(h)?.f} name={nm(h)} year={year} abbr={ab(h)} className={hw ? "won" : undefined} />
      </span>
      <span className="score">{fin ? `${as}–${hs}${ot ? (lg === "mlb" ? " extras" : " OT") : ""}` : "no result"}</span>
      <span className="meta">
        <Badge src={src} />
        {v === 1 ? <span className="ok" title="Confirmed by a second source">✓ confirmed</span> : null}
        {v === -1 ? <span className="bad" title="A second source disagrees">≠ disputed</span> : null}
      </span>
    </div>
  );
}

/** A team's result on a day: W, L or T with the score; N when the game has no result. */
function result(list: GameTuple[], team: string): { r: "W" | "L" | "T" | "N"; text: string; opp: number; home: boolean } {
  const g = list[0];
  const home = String(g[4]) === team, opp = home ? g[1] : g[4];
  if (!g || g[6] !== "f") return { r: "N", text: "·", opp, home };
  const mine = (home ? g[3] : g[2]) ?? 0, theirs = (home ? g[2] : g[3]) ?? 0;
  const r = mine > theirs ? "W" : mine < theirs ? "L" : "T";
  return { r, text: `${r} ${mine}–${theirs}`, opp, home };
}

interface Props {
  lg: string;
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
export function GameCalendar({ lg, year, teams, byDay, months, month, day, team = "", dayOnly = false, onMonth, onDay, onJump }: Props) {
  const first = atUtc(`${month}-01`);
  const most = Math.max(1, ...[...byDay.values()].map((l) => l.length));
  const cells = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push(<span key={`b${i}`} className="cell blank" />);
  for (const d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = utc.iso(d), list = byDay.get(key) ?? [];
    const dn = <span className="dn">{d.getUTCDate()}</span>;
    if (!list.length) { cells.push(<span key={key} className="cell">{dn}</span>); continue; }
    const res = team ? result(list, team) : null;
    const opp = res ? `${res.home ? "" : "@"}${abbrFor(lg, teams.get(res.opp)?.f, year, teams.get(res.opp)?.name)}` : "";
    cells.push(
      <button key={key} type="button" className={"cell has" + (res ? ` res ${res.r}` : "") + (key === day ? " on" : "")}
        style={{ "--heat": `${Math.round(18 + (62 * list.length) / most)}%` } as React.CSSProperties}
        aria-label={`${utc.monthDay(d)}: ${list.length} game${list.length === 1 ? "" : "s"}${res ? `, ${res.home ? "vs" : "at"} ${teams.get(res.opp)?.name ?? "opponent"}` : ""}`} aria-pressed={key === day}
        onClick={() => onDay(key === day ? "" : key)}>
        {res ? <span className="celltop">{dn}<span className="opab" title={teams.get(res.opp)?.name ?? undefined}>{opp}</span></span> : dn}
        {res ? <span className={"mk " + (res.r === "N" ? "" : res.r)}>{res.text}</span> : <span className="ct">{list.length}</span>}
      </button>,
    );
  }

  const mi = months.indexOf(month);
  const shown = day
    ? [[day, byDay.get(day) ?? []] as const]
    : [...byDay].filter(([k]) => k.slice(0, 7) === month).sort((a, b) => a[0].localeCompare(b[0]));
  const n = shown.reduce((a, [, l]) => a + l.length, 0);
  const monthFmt = months.length > 12 ? utc.monYear : utc.mon;

  return (
    <>
      {onJump && byDay.size ? (
        <div className="calpick">
          <DatePicker label="Jump to a day" value={day} min={[...byDay.keys()].sort()[0]} max={[...byDay.keys()].sort().at(-1) as string}
            marked={new Set(byDay.keys())} placeholder="Jump to a day…" onChange={(d) => { if (d) onJump(d); else onDay(""); }} />
        </div>
      ) : null}
      <div className="cal">
        <div className="calhead">
          <button type="button" className="nav" disabled={mi === 0} aria-label="Previous month" onClick={() => onMonth(months[mi - 1])}>‹</button>
          <div className="months">
            {months.map((m) => (
              <button key={m} type="button" className="mo" aria-pressed={m === month} onClick={() => onMonth(m)}>{monthFmt(atUtc(`${m}-01`))}</button>
            ))}
          </div>
          <button type="button" className="nav" disabled={mi === months.length - 1} aria-label="Next month" onClick={() => onMonth(months[mi + 1])}>›</button>
        </div>
        <div className="grid">
          {WEEKDAYS.map((w) => <span key={w} className="wd">{w}</span>)}
          {cells}
        </div>
      </div>
      <div className="daylist">
        {dayOnly && !day ? (
          <p className="note">{`${utc.monthYear(first)}. Pick a day to see its game.`}</p>
        ) : (
          <>
            <p className="note">
              {day ? `${utc.full(atUtc(day))}: ${n} game${n === 1 ? "" : "s"}. ` : `${utc.monthYear(first)}: ${n} games. Pick a day to see just that day. `}
              {day ? <button type="button" className="linkish" onClick={() => onDay("")}>Show the whole month</button> : null}
            </p>
            <div className="games">
              {shown.map(([date, list]) => (
                <div className="day" key={date}>
                  <h3>{utc.short(atUtc(date))}</h3>
                  {list.map((g, i) => <GameRow key={i} lg={lg} g={g} teams={teams} year={year} />)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
