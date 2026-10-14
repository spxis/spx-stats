"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { clipStay, titlesByDecade, totalsOf, type Stay } from "@/lib/cityModel";
import { fmt3 } from "@/lib/format";
import { LEAGUE_CODES, LG, seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import { addressRange, parseRange, releaseRangeHold, saveRange, savedRange, writeAddress, type YearSpan } from "@/lib/yearRange";
import { CityTimeline, type TimelineClub } from "./CityTimeline";
import { CityTitles } from "./CityTitles";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { MiniCup } from "./TrophyIcon";
import { Figures } from "./ui";
import { YearRange } from "./YearRange";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./alltime.css";
import "./city.css";

/** A club's stay in the city as the page sends it to the browser: the stay itself and the logo it wears here (none where we hold none). */
export type BoardStay = Stay & { logo: string | null };

/** Where a city page's range is remembered between visits: one key per city page, so each city keeps its own. */
export const cityRangeKey = (pathname: string): string => `spxn-range-c:${pathname}`;

/** The range of the page in the browser, as "from-to" text ("" for the whole span). The page itself is one static copy: the server never sees it, so until the
    browser has read it the board draws the whole span, as the server did. The address wins over what this browser remembers for the page. */
let chosen: string | undefined;
const listeners = new Set<() => void>();

function readRaw(): string {
  if (chosen !== undefined) return chosen;
  try {
    return addressRange() || savedRange(cityRangeKey(window.location.pathname));
  } catch { return ""; }
}

function subscribe(cb: () => void) {
  const back = () => { chosen = undefined; cb(); };
  listeners.add(cb);
  window.addEventListener("popstate", back);
  return () => { listeners.delete(cb); window.removeEventListener("popstate", back); };
}

/**
 * The part of a city page that follows the years chosen on its slider: the headline numbers, the clubs table, the timeline and the championships.
 * Everything is worked out again in the browser from the stays the page was drawn with, so the page stays one kept, static copy for everyone.
 * The range is in the address (?from=&to=) and is remembered for the next visit under a key of its own for each city. `rank` and `children` are
 * drawn by the server and stay as they are (the city's standing among the others, and the win share bars, are all-time).
 */
export function CityBoard({ stays, rank, children }: { stays: BoardStay[]; rank: ReactNode; children?: ReactNode }) {
  const { say, fmt } = useSpeaker();
  const min = useMemo(() => Math.min(...stays.map((s) => s.first)), [stays]);
  const max = useMemo(() => Math.max(...stays.map((s) => s.last)), [stays]);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const span = useMemo<YearSpan>(() => parseRange(raw, min, max) ?? { from: min, to: max }, [raw, min, max]);

  // A fresh page starts from its address and what this browser remembers; leaving it forgets what was chosen so the next city's page does too.
  useEffect(() => () => { chosen = undefined; }, []);
  // A remembered range that the address does not carry yet is written to it, so the page can be shared as it looks.
  useEffect(() => { if (raw) { const r = parseRange(raw, min, max); if (r) writeAddress(r, min, max); } }, [raw, min, max]);
  // The head script keeps the board hidden while a wanted range is pending; show it once this render uses that range (not the server's full one).
  useLayoutEffect(() => { if (raw === readRaw()) releaseRangeHold(); }, [raw]);

  const onRange = useCallback((from: number, to: number, final: boolean) => {
    const r = { from, to };
    chosen = from <= min && to >= max ? "" : `${from}-${to}`;
    writeAddress(r, min, max);
    if (final) saveRange(r, min, max, cityRangeKey(window.location.pathname));
    listeners.forEach((cb) => cb());
  }, [min, max]);

  const fullLast = useMemo(() => new Map(stays.map((s) => [`${s.league}-${s.f}`, s.last])), [stays]);
  const here = useMemo(() => stays.flatMap((s) => { const c = clipStay(s, span.from, span.to); return c ? [{ ...c, logo: s.logo }] : []; }), [stays, span]);
  const total = useMemo(() => totalsOf(here), [here]);

  // Years like "1972–now"; "now" only when the range reaches the club's last season.
  const years = (s: BoardStay) => s.cup ? [...s.titles, ...(s.finals ?? [])].sort((a, b) => a - b).join(", ") : s.runs.map(([a, b]) => (a === b ? seasonLabel(s.league, a) : `${seasonLabel(s.league, a)}–${s.active && b === s.last && s.runs.at(-1)?.[1] === b && b === fullLast.get(`${s.league}-${s.f}`) ? say("teams.now") : seasonLabel(s.league, b)}`)).join(", ");
  const record = (s: Stay) => `${s.w}–${s.l}${s.t ? `–${s.t}` : ""}${s.otl ? `–${s.otl}` : ""}`;
  const built = useMemo(() => tableOf(here, [
    { key: "club", label: say("col.team"), cls: "team", get: (s) => s.name, cell: (s) => <TeamLabel lg={s.league} f={s.cup ? null : s.f} name={s.name} logo={s.logo} /> },
    { key: "league", label: say("col.league"), get: (s) => (s.cup ? s.leagueLabel ?? "" : LG[s.league as keyof typeof LG]) },
    { key: "years", label: say("city.colYears"), cls: "seasoncell", get: (s) => s.first, cell: years },
    { key: "seasons", label: say("col.seasons"), num: true, get: (s) => s.seasons, cell: (s) => fmt(s.seasons) },
    { key: "titles", label: say("col.titles"), num: true, get: (s) => s.titles.length, cell: (s) => fmt(s.titles.length) },
    { key: "record", label: say("fig.record"), get: (s) => s.w, cell: (s) => (s.share == null ? "" : record(s)) },
    { key: "share", label: say("teams.colShare"), num: true, title: say("teams.shareTitle"), get: (s) => s.share, cell: (s) => (s.share == null ? "" : fmt3(s.share)) },
  ], (s) => `${s.league}-${s.f}`),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- years and record follow the phrases
  [here, say, fmt]);
  const tableRows = built.rows.map((r, i) => ({ ...r, group: here[i].active ? "active" : "former" }));

  const timeline = useMemo<TimelineClub[]>(() => here.filter((s) => s.rows.length).map((s) => ({ key: `${s.league}-${s.f}`, league: s.league, f: s.f, name: s.name, seasons: s.rows })), [here]);

  const decades = titlesByDecade(here);
  const leagues = LEAGUE_CODES.filter((l) => here.some((s) => s.league === l));
  const decadeRows = decades.size
    ? Array.from({ length: (Math.max(...decades.keys()) - Math.min(...decades.keys())) / 10 + 1 }, (_, i) => { const d = Math.min(...decades.keys()) + 10 * i; return { decade: d, counts: decades.get(d) ?? {} }; })
    : [];
  const titleList = here.flatMap((s) => s.titles.map((y, i) => ({ s, y, team: s.titleTeams[i] }))).sort((a, b) => b.y - a.y || a.s.league.localeCompare(b.s.league));
  const byLeagueTitles = leagues.map((l) => ({ l, n: here.filter((s) => s.league === l).reduce((a, s) => a + s.titles.length, 0) })).filter((x) => x.n);

  const narrowed = span.from > min || span.to < max;
  return (
    <div className="yr-hold cityboard">
      {max > min ? <YearRange min={min} max={max} from={span.from} to={span.to} onChange={onRange} /> : null}
      {narrowed ? <p className="note cityrangenote" aria-live="polite">{say("city.rangeNote", { from: String(span.from), to: String(span.to) })}</p> : null}
      {here.length ? (
        <Figures items={[[say("city.figClubs"), total.clubs], [say("city.figActive"), total.active], [say("fig.seasons"), total.seasons], [say("col.titles"), total.titles], [say("fig.share"), total.share == null ? "—" : fmt3(total.share)]]} />
      ) : null}

      {rank}

      {here.length ? (
        <>
          <section className="section">
            <h2>{say("city.clubsHead")}</h2>
            <div className="scroll cityclubs"><SortTable columns={built.columns} rows={tableRows} def="years.asc" label={say("city.clubsHead")} groups={[{ id: "active", title: say("city.groupActive") }, { id: "former", title: say("city.groupFormer") }]} /></div>
            <p className="note">{say("city.clubsNote")}</p>
          </section>

          <section className="section">
            <h2>{say("city.timelineHead")}</h2>
            <p className="note">{say("city.timelineNote")}</p>
            <CityTimeline clubs={timeline} />
          </section>

          {total.titles ? (
            <section className="section">
              <h2>{say("city.titlesHead")}</h2>
              <div className="citysplit">
                <ul className="citybysport" aria-label={say("city.titlesBySport")}>
                  {byLeagueTitles.map(({ l, n }) => <li key={l} style={{ "--lg": `var(--${l})` } as React.CSSProperties}><b>{LG[l as keyof typeof LG]}</b><i style={{ width: `${(100 * n) / Math.max(...byLeagueTitles.map((x) => x.n))}%` }} /><span>{fmt(n)}</span></li>)}
                </ul>
                <CityTitles decades={decadeRows} leagues={byLeagueTitles.map((x) => x.l)} />
              </div>
              <div className="seasonlist citytitlelist">
                {titleList.map(({ s, y, team }) => s.before?.includes(y) ? (
                  <span key={`${s.league}-${s.f}-${y}`} className="full" title={`${say("cup.name")} (${say("cup.before")}) ${y} · ${team}`}>
                    <MiniCup league={s.league} />{y} {say("cup.name")} · {team}
                  </span>
                ) : (
                  <Link key={`${s.league}-${s.f}-${y}`} className="full" href={seasonPath(s.league, y)} prefetch={false} title={`${LG[s.league as keyof typeof LG]} ${seasonLabel(s.league, y)} · ${team}`}>
                    <MiniCup league={s.league} />{seasonLabel(s.league, y)} {LG[s.league as keyof typeof LG]} · {team}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="note">{say("city.rangeNone", { from: String(span.from), to: String(span.to) })}</p>
      )}

      {children}
    </div>
  );
}
