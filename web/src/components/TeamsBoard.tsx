"use client";

import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { fmt3 } from "@/lib/format";
import { LEAGUES, LG } from "@/lib/leagues";
import { listTitle, teamsFilters } from "@/lib/listTitle";
import { formatSort, parseSort, sortRows, tableOf, type SortKey } from "@/lib/sort";
import {
  currentPlace, DEF_SORT, filterTeams, leagueSpan, mostTitles, pageOf, readFilters, searchTextOf, STATUSES,
  type BoardTeam, type Status,
} from "@/lib/teamBoard";
import { placeText, type Conf, type Div } from "@/lib/teamGroups";
import { replaceQuery } from "@/lib/urlQuery";
import { RANGE_PAGES, releaseRangeHold, saveRange, savedRange } from "@/lib/yearRange";
import { PageFlag } from "./PageFlag";
import { Pager } from "./Pager";
import { SortTable } from "./SortTable";
import { usePaths } from "./SlugProvider";
import { TeamLabel } from "./TeamLabel";
import { TeamLogo } from "./TeamLogo";
import { TeamsMapCorner } from "./TeamsMap";
import { ListHeading } from "./ListHeading";
import { usePageTitle } from "./usePageTitle";
import { YearRange } from "./YearRange";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { Pin } from "./mapDraw";
import "./alignment.css";
import "./teams.css";

const RANGE_KEY = RANGE_PAGES["/teams"].key;
const SPLIT = "\u0000";

// The address is the board's one source of truth: the filters, the sort and the page are read from it, and a change writes it (no request) and tells the board.
const listeners = new Set<() => void>();
const snapshot = () => {
  try { return window.location.search + SPLIT + savedRange(RANGE_KEY); } catch { return SPLIT; }
};
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => { listeners.delete(cb); window.removeEventListener("popstate", cb); };
}
function change(changes: Record<string, string | null>) {
  replaceQuery(changes);
  listeners.forEach((cb) => cb());
}

const COLUMN_KEYS = ["name", "league", "country", "place", "first", "last", "seasons", "titles", "share", "former"];

interface Props {
  teams: BoardTeam[];
  logos: string[];
  groups: Record<string, { confs: Conf[]; divs: Div[] }>;
  /** Country names in this page's language, for the codes the teams carry. */
  countries: Record<string, string>;
  /** The page's lede and links (drawn by the server), under the heading this board writes; the small map sits in the corner of the block. */
  head: ReactNode;
}

/**
 * The teams list: league, status, name search, years, conferences and divisions, a least number of titles, a sortable table with its pager, and a map
 * of the teams listed. Every franchise is sent once (about 270) and everything is filtered, sorted and paged here, so /teams stays one kept, static
 * copy for everyone and a choice costs the server nothing. The choices live in the address (?league=&q=&status=&from=&to=&conf=&div=&titles=&sort=&page=);
 * the years are also remembered for the next visit.
 */
export function TeamsBoard({ teams, logos, groups, countries, head }: Props) {
  const { say, fmt, plural } = useSpeaker();
  const uid = useId();
  const snap = useSyncExternalStore(subscribe, snapshot, () => SPLIT);
  const [search, saved] = snap.split(SPLIT);
  const now = useMemo(() => readFilters(search, teams, groups, saved), [search, saved, teams, groups]);
  // Dragging the years or typing asks for a new list at every step; the list follows when the browser has time, the controls move at once.
  const f = useDeferredValue(now);
  const spec = useMemo<SortKey[]>(() => parseSort(new URLSearchParams(search).get("sort"), COLUMN_KEYS, DEF_SORT).slice(0, 1), [search]);

  const span = useMemo(() => leagueSpan(teams, now.league), [teams, now.league]);
  const texts = useMemo(() => new Map(teams.map((t) => [t, searchTextOf(t)])), [teams]);
  const filtered = useMemo(() => filterTeams(teams, f, texts), [teams, f, texts]);
  const g = f.league ? groups[f.league] : undefined;

  // The heading and the tab's title say which teams are listed (the league, the division or conference, active or defunct), as the controls below have them.
  const here = now.league ? groups[now.league] : undefined;
  const place = (now.div ? here?.divs.find((d) => d.id === now.div)?.name : now.conf ? here?.confs.find((c) => c.id === now.conf)?.name : null) ?? null;
  const filters = teamsFilters(say, { league: now.league ? LG[now.league as keyof typeof LG] ?? null : null, place, status: now.status });
  usePageTitle(`${listTitle(say("teams.title"), filters)} · SPXN`, `${say("teams.title")} · SPXN`);

  // Years remembered for the next visit and not yet in the address: put them there, so the page can be shared as it looks.
  const hasAddressYears = useMemo(() => { const q = new URLSearchParams(search); return q.has("from") || q.has("to"); }, [search]);
  useEffect(() => {
    if (now.range && !hasAddressYears) change({ from: String(now.range.from), to: String(now.range.to) });
  }, [now.range, hasAddressYears]);
  // The head script keeps the list hidden while a wanted range is pending; show it once a render uses that range, not the server's full one.
  useLayoutEffect(() => { if (snap === snapshot()) releaseRangeHold(); }, [snap]);

  const setSort = (next: SortKey[]) => { const s = formatSort(next); change({ sort: s === DEF_SORT ? null : s, page: null }); };
  const onRange = (from: number, to: number) => {
    if (!span) return;
    const full = from <= span.min && to >= span.max;
    // What this browser remembers follows every step, so a remembered range can never come back over the one just chosen.
    saveRange({ from, to }, span.min, span.max, RANGE_KEY);
    change({ from: full ? null : String(from), to: full ? null : String(to), page: null });
  };
  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(search);
    for (const [k, v] of Object.entries(changes)) { if (v == null) q.delete(k); else q.set(k, v); }
    const s = q.toString();
    return `/teams${s ? `?${s}` : ""}`;
  };

  const sorted = useMemo(() => {
    const value = (t: BoardTeam, key: string) => {
      switch (key) {
        case "name": return t.name;
        case "league": return LG[t.lg as keyof typeof LG] ?? t.lg;
        case "country": return t.cc ? countries[t.cc] ?? t.cc : null;
        case "place": { const p = currentPlace(t); return p ? placeText(groups[t.lg] ?? { divs: [] }, p) : null; }
        case "first": return t.first;
        case "last": return t.last;
        case "seasons": return t.seasons;
        case "titles": return t.titles;
        case "share": return t.share;
        case "former": return t.former.map((x) => x[0]).join(", ");
        default: return null;
      }
    };
    return sortRows(filtered, spec, value);
  }, [filtered, spec, countries, groups]);
  const view = useMemo(() => pageOf(sorted, f.page), [sorted, f.page]);

  const paths = usePaths();
  const nowWord = say("teams.now");
  const pins = useMemo(() => pinsOf(filtered, f.league, logos, groups, paths.team, nowWord), [filtered, f.league, logos, groups, paths, nowWord]);

  const anyCountry = useMemo(() => teams.some((t) => t.cc), [teams]);
  const anyPlace = useMemo(() => teams.some((t) => t.places.length), [teams]);
  const placeOf = (t: BoardTeam) => placeText(groups[t.lg] ?? { divs: [] }, currentPlace(t) ?? [null, null]);
  const logoOf = (i: number) => (i >= 0 ? logos[i] : null);

  const table = useMemo(() => tableOf(view.items, [
    { key: "name", label: say("col.team"), cls: "team", get: (t: BoardTeam) => t.name, cell: (t: BoardTeam) => <TeamLabel lg={t.lg} f={t.f} name={t.name} logo={logoOf(t.logo)} /> },
    { key: "league", label: say("col.league"), get: (t: BoardTeam) => LG[t.lg as keyof typeof LG] ?? t.lg },
    ...(anyCountry ? [{
      key: "country", label: say("col.country"), cls: "country", get: (t: BoardTeam) => (t.cc ? countries[t.cc] ?? t.cc : null),
      cell: (t: BoardTeam) => (t.cc ? <><PageFlag code={t.cc} name={countries[t.cc]} /><span className="cc">{t.cc}</span></> : ""),
    }] : []),
    ...(anyPlace ? [{
      key: "place", label: say("teams.colPlace"), cls: "place", get: (t: BoardTeam) => { const p = currentPlace(t); return p ? placeOf(t) : null; },
      cell: (t: BoardTeam) => {
        const p = currentPlace(t);
        if (!p) return "";
        const others = t.places.slice(1).map((x) => placeText(groups[t.lg] ?? { divs: [] }, x)).filter(Boolean);
        const hint = others.length ? say("teams.movedTitle", { places: others.join("; ") }) : undefined;
        return <>{placeOf(t)}{hint ? <span className="moved" role="img" aria-label={hint} title={hint}>↻</span> : null}</>;
      },
    }] : []),
    { key: "first", label: say("col.from"), num: true, get: (t: BoardTeam) => t.first, cell: (t: BoardTeam) => (t.first == null ? "" : String(t.first)) },
    { key: "last", label: say("col.to"), num: true, get: (t: BoardTeam) => t.last, cell: (t: BoardTeam) => (t.last == null ? "" : t.active ? say("teams.now") : String(t.last)) },
    { key: "seasons", label: say("col.seasons"), num: true, get: (t: BoardTeam) => t.seasons, cell: (t: BoardTeam) => fmt(t.seasons) },
    { key: "titles", label: say("col.titles"), num: true, get: (t: BoardTeam) => t.titles, cell: (t: BoardTeam) => fmt(t.titles) },
    { key: "share", label: say("teams.colShare"), num: true, title: say("teams.shareTitle"), get: (t: BoardTeam) => t.share, cell: (t: BoardTeam) => (t.share == null ? "" : fmt3(t.share)) },
    {
      key: "former", label: say("teams.colFormer"), cls: "former", get: (t: BoardTeam) => t.former.map((x) => x[0]).join(", "),
      cell: (t: BoardTeam) => (t.former.length ? (
        <ul className="formerlist" title={t.former.map((x) => x[0]).join(", ")}>
          {t.former.map(([name, logo]) => <li key={name}><TeamLogo url={logoOf(logo)} size={16} />{name}</li>)}
        </ul>
      ) : ""),
    },
  ], (t) => `${t.lg}-${t.f}`),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- placeOf and logoOf only read the props
  [view.items, say, fmt, anyCountry, anyPlace, countries, groups, logos]);

  return (
    <>
      <section className="head fade teamshead">
        <TeamsMapCorner pins={pins} />
        <ListHeading say={say} head={say("teams.title")} filters={filters} />
        {head}
      </section>
      <section className="section">
        <div className="controls">
          <div className="seg" role="group" aria-label={say("teams.leagueAria")}>
            {[{ code: "", short: say("phase.all") }, ...LEAGUES].map((l) => (
              <button key={l.code} type="button" aria-pressed={l.code === now.league} onClick={() => change({ league: l.code || null, conf: null, div: null, page: null })}>{l.short}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label={say("teams.statusAria")}>
            {STATUSES.map((s: Status) => (
              <button key={s} type="button" aria-pressed={s === now.status} onClick={() => change({ status: s === "all" ? null : s, page: null })}>{say(STATUS_LABEL[s])}</button>
            ))}
          </div>
          <div className="teamfind">
            <label htmlFor={`${uid}-q`} className="sr-only">{say("teams.search")}</label>
            <input id={`${uid}-q`} type="search" value={now.q} placeholder={say("teams.search")} maxLength={60} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
              onChange={(e) => change({ q: e.target.value || null, page: null })} />
          </div>
        </div>
        {g && (g.confs.length || g.divs.length) ? (
          <div className="groupbar" role="group" aria-label={say("teams.groupsAria", { league: LG[f.league as keyof typeof LG] ?? f.league })}>
            {g.confs.length > 1 || (g.confs.length === 1 && g.divs.length) ? (
              <div className="groupset">
                <span className="grouplabel">{say("col.conference")}</span>
                <div className="seg wrap" role="group" aria-label={say("col.conference")}>
                  <button type="button" aria-pressed={!now.conf} onClick={() => change({ conf: null, div: null, page: null })}>{say("phase.all")}</button>
                  {g.confs.map((c) => (
                    <button key={c.id} type="button" aria-pressed={c.id === now.conf} title={say("align.barTitle", { label: c.name, from: String(c.from), to: String(c.to) })}
                      onClick={() => change({ conf: c.id, div: null, page: null })}>{c.id}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {g.divs.some((d) => !now.conf || d.conf === now.conf) ? (
              <div className="groupset">
                <span className="grouplabel">{say("col.division")}</span>
                <div className="seg wrap" role="group" aria-label={say("col.division")}>
                  <button type="button" aria-pressed={!now.div} onClick={() => change({ div: null, page: null })}>{say("phase.all")}</button>
                  {g.divs.filter((d) => !now.conf || d.conf === now.conf).map((d) => (
                    <button key={d.id} type="button" aria-pressed={d.id === now.div} title={say("align.barTitle", { label: d.name, from: String(d.from), to: String(d.to) })}
                      onClick={() => change({ div: d.id, page: null })}>{d.id}</button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="note groupnote">{say("teams.groupsNote")}</p>
          </div>
        ) : null}
        {span ? <YearRange min={span.min} max={span.max} from={now.range?.from ?? span.min} to={now.range?.to ?? span.max} onChange={onRange} /> : null}
        <TitlesControl teams={teams} league={now.league} value={now.titles} onChange={(n) => change({ titles: n > 0 ? String(n) : null, page: null })} />
        <div className="yr-hold">
          {filtered.length ? (
            <>
              <p className="note" role="status" aria-live="polite">{plural("count.teams", filtered.length)}{view.pages > 1 ? ` · ${say("players.pageOf", { page: fmt(view.page), pages: fmt(view.pages) })}` : ""}</p>
              <div className="scroll teamlist"><SortTable {...table} def={DEF_SORT} initial={spec} onSort={setSort} /></div>
              <Pager page={view.page} pages={view.pages} label={say("teams.pager")} say={say} fmt={fmt}
                href={(n) => href({ page: n > 1 ? String(n) : null })}
                onPage={(n) => { change({ page: n > 1 ? String(n) : null }); document.querySelector(".teamlist")?.scrollIntoView({ block: "start" }); }} />
            </>
          ) : <p className="note">{say("teams.none")}</p>}
        </div>
      </section>
    </>
  );
}

const STATUS_LABEL = { all: "teams.statusAll", active: "teams.statusActive", defunct: "teams.statusDefunct" } as const;

/** The least number of titles a team must hold to be listed: a slider from none to the most any listed league's team holds. */
function TitlesControl({ teams, league, value, onChange }: { teams: BoardTeam[]; league: string; value: number; onChange: (n: number) => void }) {
  const { say } = useSpeaker();
  const uid = useId();
  const most = useMemo(() => mostTitles(teams, league), [teams, league]);
  if (most < 1) return null;
  return (
    <div className="mintitles">
      <label htmlFor={`${uid}-t`}>{say("teams.minTitles")}</label>
      <input id={`${uid}-t`} type="range" min={0} max={most} step={1} value={Math.min(value, most)} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={`${uid}-t`}>{value > 0 ? say("teams.titlesAtLeast", { n: String(value) }) : say("teams.titlesAny")}</output>
    </div>
  );
}

/** The dots of the listed teams for the map: each at its latest home, linked to its page. With one league chosen they carry their conference and division (the large map's filters and colours); with all of them, one colour per league. */
function pinsOf(list: BoardTeam[], league: string, logos: string[], groups: Props["groups"], team: (lg: string, f: number) => string, now: string): Pin[] {
  const out: Pin[] = [];
  for (const t of list) {
    if (t.lat == null || t.lon == null) continue;
    const p = league ? currentPlace(t) : null;
    const div = p?.[1] ? groups[t.lg]?.divs.find((d) => d.id === p[1])?.short ?? p[1] : null;
    out.push({
      f: out.length, name: t.name, abbr: t.lg.toUpperCase(), lat: t.lat, lon: t.lon, cc: t.cc, place: t.place,
      venue: t.first == null ? null : `${t.first}–${t.active ? now : t.last}`, href: team(t.lg, t.f), defunct: !t.active,
      logo: t.logo >= 0 ? logos[t.logo] : null, tone: league ? undefined : `var(--${t.lg})`, conf: p?.[0] ?? null, div,
    });
  }
  return out;
}
