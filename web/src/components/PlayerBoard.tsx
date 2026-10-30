"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { clubKey, groupViews, indexRefs, unpackRef, playerPresets, peakRun, type Phase, type RefPack } from "@/lib/playerBoard";
import { readBoard, type BoardWire } from "@/lib/playerBoardWire";
import { parsePlayerState, playerRangeKey, playerStateText, type PlayerState } from "@/lib/playerRange";
import { releaseRangeHold, saveRange, savedRange } from "@/lib/yearRange";
import { seasonLabel } from "@/lib/leagues";
import { SPRAY_FROM } from "@/lib/playerSpray";
import { useSpeaker } from "./i18n/LocaleProvider";
import { PlayerCharts } from "./PlayerChartsLazy";
import type { BoardView } from "./playerView";
import { PlayerHero } from "./PlayerHero";
import { PlayerPath } from "./PlayerPath";
import { PlayerSpray } from "./PlayerSpray";
import { PlayerSeasonsTable, PlayerStatTables } from "./PlayerTables";
import { useFetchedJson } from "./useFetchedJson";
import { YearRange } from "./YearRange";
import "./playerboard.css";

/** What the board holds of the page's state in the address, as a query text (only its own keys). The page itself is one static copy: the
    server never sees this. Until the browser has read it the board draws the whole career, like the server did. */
let chosen: string | undefined;
const listeners = new Set<() => void>();
const KEYS = ["from", "to", "phase", "teams", "season"];

function ownQuery(search: string): string {
  const q = new URLSearchParams(search), out = new URLSearchParams();
  for (const k of KEYS) { const v = q.get(k); if (v !== null) out.set(k, v); }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** The address' own keys, or when it names no range the one remembered for this page (so the page opens where the reader left it). */
function readQuery(): string {
  if (chosen !== undefined) return chosen;
  try {
    const own = ownQuery(window.location.search);
    const q = new URLSearchParams(own);
    if (q.has("from") || q.has("to") || q.has("season")) return own;
    const saved = /^(\d{1,4})-(\d{1,4})$/.exec(savedRange(playerRangeKey(window.location.pathname)));
    if (saved) { q.set("from", saved[1]); q.set("to", saved[2]); return `?${q.toString()}`; }
    return own;
  } catch { return ""; }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => { listeners.delete(cb); window.removeEventListener("popstate", cb); };
};

/** Puts the board's keys in the address (other keys, like a table's sort, stay) without adding history. */
function writeQuery(text: string) {
  try {
    const url = new URL(window.location.href);
    for (const k of KEYS) url.searchParams.delete(k);
    new URLSearchParams(text).forEach((v, k) => url.searchParams.set(k, v));
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  } catch { /* the address stays as it is */ }
}

/** The player's board: the season slider with its shortcuts, the phase and club choices, and everything below it drawn for those seasons. */
export function PlayerBoard({ wire, id }: { wire: BoardWire; id: number }) {
  const { say, plural } = useSpeaker();
  const data = useMemo(() => readBoard(wire), [wire]);
  const { min, max } = data;
  const validClubs = useMemo(() => [...new Set(data.stats.map(clubKey))], [data.stats]);
  const raw = useSyncExternalStore(subscribe, readQuery, () => "");
  const state = useMemo(() => parsePlayerState(raw, min, max, validClubs), [raw, min, max, validClubs]);
  // The league's figures (ranks, percentiles, the radar, the league line) are fetched once the board is drawn, not carried by the page; until they are here the board leaves out what needs them.
  const fetched = useFetchedJson<RefPack[]>(`/api/players/${id}/refs`, "refs", true);
  const refs = useMemo(() => indexRefs((fetched.data ?? []).map(unpackRef)), [fetched.data]);

  // A fresh page starts from its address; leaving it forgets what was chosen so the next player's page does too.
  useEffect(() => () => { chosen = undefined; }, []);
  // A remembered range that the address does not carry yet is written to it, so the page can be shared as it looks.
  useEffect(() => { if (raw) writeQuery(raw); }, [raw]);
  // The head script keeps the board hidden while a wanted range is pending; show it once this render uses that range (not the server's full one).
  useLayoutEffect(() => { if (raw === readQuery()) releaseRangeHold(); }, [raw]);

  const change = useCallback((next: PlayerState, final: boolean) => {
    chosen = playerStateText(next, min, max);
    writeQuery(chosen);
    if (final) saveRange(next.span, min, max, playerRangeKey(window.location.pathname));
    listeners.forEach((cb) => cb());
  }, [min, max]);
  const setSpan = useCallback((from: number, to: number) => change({ ...state, span: { from, to } }, true), [change, state]);

  const groups = useMemo(() => groupViews(data.stats, state.span, state.phase, state.clubs, data.position), [data.stats, data.position, state.span, state.phase, state.clubs]);
  const hasPlayoffs = data.stats.some((s) => s.phase === "playoffs");
  const clubs = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...data.stats].sort((a, b) => a.year - b.year)) m.set(clubKey(r), r.team ?? say("team.fallback", { id: r.f }));
    return m;
  }, [data.stats, say]);

  // The best five seasons in a row by the headline stat of the first group (a goalie's wins, a skater's points ...).
  const peak = useMemo(() => {
    const g = groups[0];
    if (!g) return null;
    const m = g.def.metrics.find((x) => x.id === g.def.main)!;
    const byYear = new Map<number, number>();
    for (const r of g.all) byYear.set(r.year, (byYear.get(r.year) ?? 0) + (m.get(r.stats) ?? 0));
    return peakRun([...byYear].map(([year, v]) => ({ year, v })), 5);
  }, [groups]);

  const view: BoardView = { data, state, refs, groups, setSpan };
  const onRange = useCallback((from: number, to: number, final: boolean) => change({ ...state, span: { from, to } }, final), [change, state]);
  const toggleClub = (key: string) => {
    const next = new Set(state.clubs);
    if (!next.delete(key)) next.add(key);
    change({ ...state, clubs: next.size && next.size < clubs.size ? next : new Set() }, true);
  };
  const inRangeSeasons = new Set(data.seasons.filter((s) => s.year >= state.span.from && s.year <= state.span.to).map((s) => `${s.league}|${s.year}`)).size;
  const games = groups[0]?.def.games(groups[0].total) ?? 0;
  const leagues = [...new Set(data.seasons.map((s) => s.league))];
  const label = (y: number) => seasonLabel(leagues[0] ?? "nhl", y);

  return (
    <section className="section yr-hold pboard" id="statistics">
      <h2>{say("player.statsFor", { name: data.name })}</h2>
      {max > min ? (
        <YearRange min={min} max={max} from={state.span.from} to={state.span.to} onChange={onRange} presets={playerPresets(min, max, peak)} />
      ) : null}
      <div className="pcontrols">
        {hasPlayoffs ? (
          <div className="seg" role="group" aria-label={say("phase.aria")}>
            {(["regular", "playoffs"] as Phase[]).map((p) => (
              <button key={p} type="button" aria-pressed={state.phase === p} onClick={() => change({ ...state, phase: p }, true)}>{say(p === "regular" ? "phase.regular" : "phase.playoffs")}</button>
            ))}
          </div>
        ) : null}
        <p className="note psummary" aria-live="polite">
          {say("board.summary", { from: label(state.span.from), to: label(state.span.to), seasons: plural("board.seasonsIn", inRangeSeasons) })}
          {games ? ` · ${plural("board.gamesIn", games)}` : ""}
        </p>
      </div>
      {clubs.size > 1 ? (
        <div className="seg scroll pclubs" role="group" aria-label={say("player.teamFilter")}>
          <button type="button" aria-pressed={state.clubs.size === 0} onClick={() => change({ ...state, clubs: new Set() }, true)}>{say("player.allTeams")}</button>
          {[...clubs].map(([key, name]) => (
            <button key={key} type="button" aria-pressed={state.clubs.has(key)} onClick={() => toggleClub(key)}>{name}</button>
          ))}
        </div>
      ) : null}
      {data.seasons.length ? <PlayerPath view={view} /> : null}
      {groups.length ? (
        <>
          <PlayerHero view={view} />
          <PlayerCharts view={view} />
          <PlayerStatTables view={view} />
        </>
      ) : <p className="note">{say("player.statsNone")}</p>}
      {data.seasons.some((s) => s.league === "mlb" && s.year >= SPRAY_FROM) ? <PlayerSpray id={id} name={data.name} position={data.position} from={state.span.from} to={state.span.to} /> : null}
      <PlayerSeasonsTable view={view} />
      {groups.length ? <p className="note">{say("player.statsCredit")}</p> : null}
    </section>
  );
}
