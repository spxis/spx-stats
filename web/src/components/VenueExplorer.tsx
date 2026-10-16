"use client";

import Link from "@/components/Link";
import { Fragment, useDeferredValue, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fold } from "@/lib/fold";
import { tableOf } from "@/lib/sort";
import { replaceQuery } from "@/lib/urlQuery";
import { venueCountryName } from "@/lib/venueCountry";
import { isSoccerLeague } from "@/lib/venueSoccerRows";
import { roofWord, stateWord, surfaceWord } from "@/lib/venueSurface";
import { DEFAULT_SHOW, emptyFilter, filterQuery, leagueColor, readFilter, venueColor, venueMatches, VENUE_KINDS, type VenueFilter, type VenueRow, type VenueStatus } from "@/lib/venueModel";
import { VisitBox, VisitCell, VisitControl } from "./VenueVisits";
import { useVisits } from "./visitsStore";
import { unpackVenues, type VenueWire } from "@/lib/venueWire";
import { useSpeaker } from "./i18n/LocaleProvider";
import { MapViewer } from "./MapViewer";
import type { Pin } from "./mapDraw";
import { createRowLink } from "./rowLink";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { YearRange } from "./YearRange";
import "./team.css";
import "./venues.css";

const KIND_KEY = { home: "venuesPage.kindHome", spring: "venuesPage.kindSpring", future: "venuesPage.kindFuture", soccer: "venuesPage.kindSoccer" } as const;
const SPRING_KEY = { cactus: "venuesPage.springCactus", grapefruit: "venuesPage.springGrapefruit" } as const;
const FUTURE_KEY = { proposed: "venuesPage.futureProposed", approved: "venuesPage.futureApproved", under_construction: "venuesPage.futureUnderConstruction" } as const;

/**
 * The venues page: filters (league, current or former, country, conference and division, years used), a map of the venues that pass and
 * a sortable table of them. Everything is filtered in the browser from the one list the page was drawn with, so the page stays a kept,
 * static copy (the rows arrive once, packed: venueWire.ts); the choices are kept in the address (?league=&status=&visited=&nat=&conf=&div=&from=&to=) and read once the page is on screen.
 * The reader's own "visited" list (VenueVisits.tsx) lives in the browser only: the server never draws any of it, and the page reads it once it is on screen.
 *
 * Dots are coloured by league (grey for a venue several leagues used) and a venue no club plays at now is a hollow ring, so the
 * difference does not rest on colour. The leagues, and their colours, are whatever the rows carry. A spring training park is a square
 * a venue not built yet a dashed ring and a world soccer stadium (World Cup, MLS) a diamond: the kinds differ in shape, and the "Show" choice (?show=home,spring,future,soccer) adds them to the home venues.
 */
export function VenueExplorer({ wire, leagues, labels, min, max }: { wire: VenueWire; leagues: string[]; labels: Record<string, string>; min: number; max: number }) {
  const speaker = useSpeaker();
  const { say, fmt, plural } = speaker;
  const venues = useMemo(() => unpackVenues(wire, leagues, say, (cc) => venueCountryName(cc, speaker)), [wire, leagues, say, speaker]);
  // The table is drawn in the browser only: the page's HTML holds a plain list of the venues for a reader without scripts (and for a crawler), not 242 rows of table markup that the rows above already describe.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const uid = useId();
  const bounds = useMemo(() => ({ min, max }), [min, max]);
  const order = useMemo(() => new Map(leagues.map((l, i) => [l, i])), [leagues]);
  const [q, setQ] = useState("");
  const [f, setF] = useState<VenueFilter>(() => emptyFilter(bounds));
  const [picked, setPicked] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const { visits } = useVisits();
  const ready = useRef(false);
  const link = useMemo(() => createRowLink(), []);
  const wanted = useDeferredValue({ q, f });

  // A kept page is drawn once for everyone: the choices in the address are read here, once it is on screen, and again on back and forward.
  useEffect(() => {
    const read = () => setF(readFilter(location.search, bounds, leagues));
    read();
    ready.current = true;
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [bounds, leagues]);
  const change = (next: Partial<VenueFilter>) => {
    const merged = { ...f, ...next };
    setF(merged);
    setPicked(null);
    if (ready.current) replaceQuery(filterQuery(merged, bounds));
  };

  const search = useMemo(() => new Map(venues.map((v) => [v.id, fold([v.name, v.former, v.place, ...v.clubs.map((c) => c.name)].filter(Boolean).join(" "))])), [venues]);
  // The list is a dependency only while the visited filter is on, so marking a venue does not redraw the map (and lose its zoom) otherwise.
  const gate = wanted.f.visited ? visits : undefined;
  const shown = useMemo(() => {
    const words = fold(wanted.q).split(" ").filter(Boolean);
    return venues.filter((v) => venueMatches(v, wanted.f, bounds, gate) && words.every((w) => search.get(v.id)?.includes(w)));
  }, [venues, wanted, bounds, search, gate]);

  const leagueName = (l: string) => labels[l] ?? l.toUpperCase();
  // Only the countries of the kinds on show: the world soccer stadiums are in some eighty, which would crowd the choice while only the home venues are listed.
  const countries = useMemo(() => [...new Set(venues.filter((v) => f.show.includes(v.kind)).map((v) => v.cc).filter((c): c is string => !!c))].sort((a, b) => venueCountryName(a, speaker).localeCompare(venueCountryName(b, speaker), speaker.locale)), [venues, f.show, speaker]);
  const countryName = (c: string) => venueCountryName(c, speaker);
  // A competition's chip is offered once its stadiums are on show.
  const chipLeagues = useMemo(() => leagues.filter((l) => !isSoccerLeague(l) || f.show.includes("soccer")), [leagues, f.show]);

  // Conferences and divisions of the clubs playing now, for the leagues on show.
  const aligned = useMemo(() => {
    const confs = new Map<string, string>();
    const divs = new Map<string, { conf: string; label: string }>();
    const inLeagues = (lg: string) => !f.leagues.length || f.leagues.includes(lg);
    const many = (f.leagues.length || leagues.length) > 1;
    for (const v of venues) for (const a of v.al) {
      const [lg, conf, div] = a.split("|");
      if (!inLeagues(lg)) continue;
      if (conf) confs.set(`${lg}|${conf}`, many ? `${leagueName(lg)} ${conf}` : conf);
      if (div) {
        const own = conf && !div.startsWith(conf) ? `${conf} ${div}` : div;
        divs.set(`${lg}|${conf}|${div}`, { conf: `${lg}|${conf}`, label: many ? `${leagueName(lg)} ${own}` : own });
      }
    }
    const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], "en");
    return {
      confs: [...confs].sort(byLabel),
      divs: [...divs].filter(([, d]) => !f.conf || d.conf === f.conf).map(([k, d]) => [k, d.label] as [string, string]).sort(byLabel),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leagueName follows the labels
  }, [venues, f.leagues, f.conf, leagues, labels]);

  const years = (a: number | null, b: number | null) => `${a ?? "…"}–${b ?? say("team.today")}`;
  /** What kind of place a non-home row is, in words: the park's league, or the status of the plan and its year. */
  const tagText = (v: VenueRow): string | null => {
    if (v.kind === "spring") return say(v.tag === "grapefruit" ? SPRING_KEY.grapefruit : SPRING_KEY.cactus);
    if (v.kind !== "future") return null;
    const status = v.tag && v.tag in FUTURE_KEY ? say(FUTURE_KEY[v.tag as keyof typeof FUTURE_KEY]) : null;
    return [status, v.planned ? say("venuesPage.planned", { year: v.planned }) : null].filter(Boolean).join(" · ") || null;
  };
  /** The years a club used a venue; a club of a venue not built yet has none, only the year the venue is planned. */
  const usedText = (v: VenueRow, c: VenueRow["clubs"][number]) => `${leagueName(c.lg)}${v.kind === "future" ? "" : ` · ${years(c.from, c.to)}`}`;

  const table = useMemo(() => (!mounted ? null : tableOf(shown, [
    {
      key: "visited", label: say("visits.visited"), cls: "venuevisit", get: (v) => (visits[v.key] ? 1 : 0),
      cell: (v) => <VisitCell v={v} vis={visits[v.key]} editing={editing === v.id} onEdit={(open) => setEditing(open ? v.id : null)} />,
    },
    {
      key: "name", label: say("venuesPage.colVenue"), cls: "team venuename", get: (v) => v.name,
      cell: (v) => (
        <>
          {v.slug ? <Link href={`/venue/${v.slug}`} prefetch={false}>{v.name}</Link> : v.wiki ? <a className="ext" href={v.wiki} target="_blank" rel="noopener noreferrer">{v.name}</a> : v.name}
          {v.kind !== "future" && !v.current ? <span className="venuetag"> {say("venuesPage.former")}</span> : null}
          {v.kind === "spring" || v.kind === "future" ? <span className="venuetag"> {tagText(v)}</span> : null}
          {v.former ? <span className="sub venuenames">{v.former}</span> : null}
        </>
      ),
    },
    {
      key: "city", label: say("venuesPage.colCity"), cls: "venuecity", get: (v) => v.place,
      cell: (v) => (v.citySlug && v.place ? <Link href={`/city/${v.citySlug}`} prefetch={false}>{v.place}</Link> : v.place ?? ""),
    },
    {
      key: "leagues", label: say("venuesPage.colLeagues"), get: (v) => v.leagues.map(leagueName).join(" "),
      cell: (v) => v.leagues.map((l, i) => (
        <span key={l}>{i ? ", " : ""}<span className="lgdot" style={{ background: leagueColor(l, order.get(l) ?? 0) }} aria-hidden="true" />{leagueName(l)}</span>
      )),
    },
    {
      key: "clubs", label: say("venuesPage.colClubs"), cls: "venueclubs", get: (v) => v.clubs[0]?.name,
      cell: (v) => v.clubs.map((c, i) => (
        <span key={`${c.lg}${c.f}${c.name}`}>{i ? ", " : ""}{c.f ? <TeamLabel lg={c.lg} f={c.f} name={c.name} logo={c.logo} title={usedText(v, c)} /> : <span title={usedText(v, c)}>{c.name}</span>}</span>
      )),
    },
    { key: "opened", label: say("venuesPage.colOpened"), num: true, get: (v) => v.opened, cell: (v) => (v.opened == null ? "" : String(v.opened)) },
    {
      // A year when a source gives one; else "Demolished" for a venue a source says is gone with no year (status demolished, db/build/193).
      key: "closed", label: say("venuesPage.colClosed"), num: true, get: (v) => v.closed,
      cell: (v) => (v.closed != null ? String(v.closed) : v.state === "demolished" ? stateWord(v.state, say) ?? "" : ""),
    },
    { key: "capacity", label: say("venuesPage.colCapacity"), num: true, get: (v) => v.capacity, cell: (v) => (v.capacity == null ? "" : fmt(v.capacity)) },
    { key: "games", label: say("venuesPage.colGames"), num: true, get: (v) => v.games, cell: (v) => (v.games == null ? "" : fmt(v.games)) },
    {
      key: "roof", label: say("venuesPage.colRoof"), get: (v) => roofWord(v.roof, say),
      cell: (v) => roofWord(v.roof, say) ?? "",
    },
    { key: "surface", label: say("venuesPage.colSurface"), get: (v) => surfaceWord(v.surface, say), cell: (v) => surfaceWord(v.surface, say) ?? "" },
  ], (v) => v.id)),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phrases follow the language
  [mounted, shown, say, fmt, labels, order, visits, editing]);

  const index = useMemo(() => new Map(venues.map((v, i) => [v, i])), [venues]);
  const pins = useMemo<Pin[]>(() => shown.map((v) => {
    const clubs = v.clubs.map((c) => c.name);
    return {
      f: index.get(v) ?? 0, name: v.name, lat: v.lat, lon: v.lon, cc: v.cc, wiki: v.wiki, place: v.place, tone: venueColor(v, order), defunct: v.kind === "future" ? false : !v.current,
      shape: v.kind === "spring" ? "square" : v.kind === "future" ? "plan" : v.kind === "soccer" ? "diamond" : undefined,
      team: clubs.slice(0, 4).join(", ") + (clubs.length > 4 ? ` +${clubs.length - 4}` : ""),
      teamHref: v.clubs.length === 1 && v.clubs[0].href ? v.clubs[0].href : undefined,
      venue: v.kind === "future" ? [v.leagues.map(leagueName).join(" · "), tagText(v)].filter(Boolean).join(" · ")
        : `${v.leagues.map(leagueName).join(" · ")}${v.kind === "spring" ? ` · ${tagText(v)}` : ""} · ${v.current ? years(v.from, null) : `${years(v.from, v.to)} · ${say("venuesPage.former")}`}`,
      extra: v.extra, address: v.address, addressHref: v.addressHref,
    };
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phrases follow the language
  [shown, index, order, say, labels]);

  const pick = (i: number) => { setPicked(i); link.pin(venues[i].id); };

  const full = f.from <= min && f.to >= max;
  const statusButton = (value: VenueStatus, key: "venuesPage.statusAll" | "venuesPage.statusCurrent" | "venuesPage.statusFormer") => (
    <button type="button" aria-pressed={f.status === value} onClick={() => change({ status: value })}>{say(key)}</button>
  );

  return (
    <>
      <div className="controls cityfind venuefind">
        <label htmlFor={`${uid}-q`} className="sr-only">{say("venuesPage.search")}</label>
        <input id={`${uid}-q`} type="search" value={q} placeholder={say("venuesPage.search")} maxLength={60} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
        <p className="note" role="status" aria-live="polite">{plural("count.venues", shown.length)}</p>
      </div>
      <div className="visitslot">
        {mounted ? <VisitBox venues={venues} leagues={leagues} labelOf={leagueName} mode={f.visited} onMode={(visited) => change({ visited })} /> : null}
      </div>
      <div className="venuefilters">
        <div className="chips" role="group" aria-label={say("venuesPage.leagues")}>
          {chipLeagues.map((l) => {
            const on = f.leagues.includes(l);
            return (
              <button key={l} type="button" className="chip" aria-pressed={on} onClick={() => change({ leagues: on ? f.leagues.filter((x) => x !== l) : [...f.leagues, l], conf: "", div: "" })}>
                <i style={{ background: leagueColor(l, order.get(l) ?? 0) }} aria-hidden="true" />{leagueName(l)}
              </button>
            );
          })}
        </div>
        <div className="seg" role="group" aria-label={say("venuesPage.show")}>
          {VENUE_KINDS.map((k) => {
            const on = f.show.includes(k);
            const next = on ? f.show.filter((x) => x !== k) : VENUE_KINDS.filter((x) => x === k || f.show.includes(x));
            return (
              <button key={k} type="button" className="kind" aria-pressed={on} disabled={on && f.show.length === 1} onClick={() => change({ show: next.length ? next : [...DEFAULT_SHOW] })}>
                <i className={k === "spring" ? "square" : k === "future" ? "plan" : k === "soccer" ? "diamond" : "filled"} aria-hidden="true" />{say(KIND_KEY[k])}
              </button>
            );
          })}
        </div>
        <div className="seg" role="group" aria-label={say("venuesPage.status")}>
          {statusButton("", "venuesPage.statusAll")}
          {statusButton("current", "venuesPage.statusCurrent")}
          {statusButton("former", "venuesPage.statusFormer")}
        </div>
        {countries.length > 1 ? (
          <select aria-label={say("venuesPage.country")} value={f.cc} onChange={(e) => change({ cc: e.target.value })}>
            <option value="">{say("venuesPage.countryAll")}</option>
            {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        ) : null}
        {aligned.confs.length > 1 ? (
          <select aria-label={say("map.conference")} value={f.conf} onChange={(e) => change({ conf: e.target.value, div: "" })}>
            <option value="">{say("map.allConf")}</option>
            {aligned.confs.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        ) : null}
        {aligned.divs.length > 1 ? (
          <select aria-label={say("map.division")} value={aligned.divs.some(([k]) => k === f.div) ? f.div : ""} onChange={(e) => change({ div: e.target.value })}>
            <option value="">{say("map.allDiv")}</option>
            {aligned.divs.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        ) : null}
      </div>
      <YearRange min={min} max={max} from={f.from} to={f.to} onChange={(from, to, final) => (final ? change({ from, to }) : setF((cur) => ({ ...cur, from, to })))} />
      {shown.length ? (
        <>
          <MapViewer
            bar={mounted && picked != null && venues[picked] ? <VisitControl key={venues[picked].key} vkey={venues[picked].key} name={venues[picked].name} /> : null}
            pins={pins} title={say("venuesPage.mapTitle")} total={pins.length} selected={picked != null ? picked : undefined} onPick={pick}
            note={say("venuesPage.mapNote", { n: fmt(pins.length) })}
          />
          <ul className="maplegend venuelegend" aria-label={say("venuesPage.legend")}>
            {leagues.filter((l) => shown.some((v) => v.leagues.length === 1 && v.leagues[0] === l)).map((l) => <li key={l}><i style={{ background: leagueColor(l, order.get(l) ?? 0) }} />{leagueName(l)}</li>)}
            {shown.some((v) => v.leagues.length > 1) ? <li><i style={{ background: "var(--muted)" }} />{say("venuesPage.legendSeveral")}</li> : null}
            <li><i className="filled" />{say("venuesPage.legendCurrent")}</li>
            <li><i className="ring" />{say("venuesPage.legendFormer")}</li>
            {shown.some((v) => v.kind === "spring") ? <li><i className="square" />{say("venuesPage.legendSpring")}</li> : null}
            {shown.some((v) => v.kind === "future") ? <li><i className="plan" />{say("venuesPage.legendFuture")}</li> : null}
            {shown.some((v) => v.kind === "soccer") ? <li><i className="diamond" />{say("venuesPage.legendSoccer")}</li> : null}
          </ul>
          <div className={`scroll venuetable${table ? "" : " pending"}`}>
            {table
              ? <SortTable columns={table.columns} rows={table.rows} def="name.asc" label={say("venuesPage.title")} link={link} />
              : <noscript><PlainList venues={shown} /></noscript>}
          </div>
          {!full ? <p className="note">{say("venuesPage.rangeNote", { from: String(f.from), to: String(f.to) })}</p> : null}
        </>
      ) : <p className="note">{say("venuesPage.none")}</p>}
    </>
  );
}

/** The venues as a plain list, for a reader without scripts: the name, the city and each club, the clubs linked. No logos here: they would be the largest part of the page for the few who read it. */
function PlainList({ venues }: { venues: VenueRow[] }) {
  return (
    <ul className="venueplain">
      {venues.map((v) => (
        <li key={v.id}>
          {v.slug ? <Link href={`/venue/${v.slug}`} prefetch={false}>{v.name}</Link> : v.name}{`${v.place ? `, ${v.place}` : ""}: `}
          {v.clubs.map((c, i) => (
            <Fragment key={`${c.lg}${c.f}${c.name}`}>{i ? ", " : ""}{c.f ? <TeamLabel lg={c.lg} f={c.f} name={c.name} logo={null} href={c.href} /> : c.name}</Fragment>
          ))}
        </li>
      ))}
    </ul>
  );
}
