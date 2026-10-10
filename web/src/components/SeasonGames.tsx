"use client";

import { useEffect, useMemo, useState } from "react";
import { atUtc, utc } from "@/lib/format";
import { resolveSelection, selectionQuery, type ClubTeam, type GameTuple, type Selection } from "@/lib/season";
import { Badge, TeamLink } from "./ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PHASES: [string, string][] = [["r", "Regular season"], ["p", "Playoffs"], ["", "All"]];

function GameRow({ lg, g, teams }: { lg: string; g: GameTuple; teams: Map<number, ClubTeam> }) {
  const [, a, as, hs, h, , st, src, ot, v] = g;
  const fin = st === "f";
  const aw = fin && (as ?? 0) > (hs ?? 0), hw = fin && (hs ?? 0) > (as ?? 0);
  const nm = (id: number) => teams.get(id)?.name || "—";
  return (
    <div className="game">
      <span>
        <TeamLink lg={lg} f={teams.get(a)?.f} name={nm(a)} className={aw ? "won" : undefined} />
        {" at "}
        <TeamLink lg={lg} f={teams.get(h)?.f} name={nm(h)} className={hw ? "won" : undefined} />
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
function result(list: GameTuple[], team: string): { r: "W" | "L" | "T" | "N"; text: string } {
  const g = list[0];
  if (!g || g[6] !== "f") return { r: "N", text: "·" };
  const home = String(g[4]) === team;
  const mine = (home ? g[3] : g[2]) ?? 0, theirs = (home ? g[2] : g[3]) ?? 0;
  const r = mine > theirs ? "W" : mine < theirs ? "L" : "T";
  return { r, text: `${r} ${mine}–${theirs}` };
}

/**
 * The games of a season: part-of-season buttons, a team filter, a month calendar shaded by games held
 * (or by the team's result on its days), and the games of the chosen day or month.
 * The selection lives in the address (?phase=&team=&month=&day=), so a reload or shared link keeps it.
 */
export function SeasonGames({ lg, games, teams: teamList, initial }: { lg: string; games: GameTuple[]; teams: ClubTeam[]; initial: Selection }) {
  const teams = useMemo(() => new Map(teamList.map((t) => [t.id, t])), [teamList]);
  const [want, setWant] = useState<Selection>(initial);
  const { byDay, months, month, day } = useMemo(() => resolveSelection(games, want), [games, want]);
  const { phase, team } = want;

  // Keep the address in step with what is shown (the same query the server read).
  useEffect(() => {
    const href = location.pathname + selectionQuery({ phase, team, month, day });
    if (href !== location.pathname + location.search) history.replaceState(null, "", href);
  }, [phase, team, month, day]);

  const set = (patch: Partial<Selection>) => setWant({ phase, team, month, day, ...patch });

  const controls = (
    <div className="controls">
      <div className="seg" role="group" aria-label="Part of season">
        {PHASES.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={k === phase} onClick={() => set({ phase: k })}>{label}</button>
        ))}
      </div>
      <select aria-label="Team" value={team} onChange={(e) => set({ team: e.target.value })}>
        <option value="">All teams</option>
        {teamList.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
      </select>
    </div>
  );

  if (!months.length) {
    return (
      <>
        {controls}
        <div className="daylist"><p className="note">No games for this choice.</p></div>
      </>
    );
  }

  const first = atUtc(`${month}-01`);
  const most = Math.max(1, ...[...byDay.values()].map((l) => l.length));
  const cells = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push(<span key={`b${i}`} className="cell blank" />);
  for (const d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = utc.iso(d), list = byDay.get(key) ?? [];
    const dn = <span className="dn">{d.getUTCDate()}</span>;
    if (!list.length) { cells.push(<span key={key} className="cell">{dn}</span>); continue; }
    const res = team ? result(list, team) : null;
    cells.push(
      <button key={key} type="button" className={"cell has" + (res ? ` res ${res.r}` : "") + (key === day ? " on" : "")}
        style={{ "--heat": `${Math.round(18 + (62 * list.length) / most)}%` } as React.CSSProperties}
        aria-label={`${utc.monthDay(d)}: ${list.length} game${list.length === 1 ? "" : "s"}`} aria-pressed={key === day}
        onClick={() => set({ day: key === day ? "" : key })}>
        {dn}
        {res ? <span className={"mk " + (res.r === "N" ? "" : res.r)}>{res.text}</span> : <span className="ct">{list.length}</span>}
      </button>,
    );
  }

  const mi = months.indexOf(month);
  const goMonth = (k: number) => set({ month: months[k], day: "" });
  const shown = day
    ? [[day, byDay.get(day) ?? []] as const]
    : [...byDay].filter(([k]) => k.slice(0, 7) === month).sort((a, b) => a[0].localeCompare(b[0]));
  const n = shown.reduce((a, [, l]) => a + l.length, 0);
  const monthFmt = months.length > 12 ? utc.monYear : utc.mon;

  return (
    <>
      {controls}
      <div className="cal">
        <div className="calhead">
          <button type="button" className="nav" disabled={mi === 0} aria-label="Previous month" onClick={() => goMonth(mi - 1)}>‹</button>
          <div className="months">
            {months.map((m, k) => (
              <button key={m} type="button" className="mo" aria-pressed={m === month} onClick={() => goMonth(k)}>{monthFmt(atUtc(`${m}-01`))}</button>
            ))}
          </div>
          <button type="button" className="nav" disabled={mi === months.length - 1} aria-label="Next month" onClick={() => goMonth(mi + 1)}>›</button>
        </div>
        <div className="grid">
          {WEEKDAYS.map((w) => <span key={w} className="wd">{w}</span>)}
          {cells}
        </div>
      </div>
      <div className="daylist">
        <p className="note">
          {day ? `${utc.full(atUtc(day))}: ${n} game${n === 1 ? "" : "s"}. ` : `${utc.monthYear(first)}: ${n} games. Pick a day to see just that day. `}
          {day ? <button type="button" className="linkish" onClick={() => set({ day: "" })}>Show the whole month</button> : null}
        </p>
        <div className="games">
          {shown.map(([date, list]) => (
            <div className="day" key={date}>
              <h3>{utc.short(atUtc(date))}</h3>
              {list.map((g, i) => <GameRow key={i} lg={lg} g={g} teams={teams} />)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
