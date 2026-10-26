"use client";

import Link from "@/components/Link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { atUtc } from "@/lib/format";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { countryName, inches } from "@/lib/people-format";
import type { Phase } from "@/lib/playerBoard";
import { careerRows, commonGroups, decades, peakRow, pickerQuery, radarPairs, sideOf, statLines, type CompareData, type Side, type Win } from "@/lib/playerCompare";
import { showStat } from "@/lib/playerStats";
import { positionsShort } from "@/lib/positions";
import { useSpeaker } from "./i18n/LocaleProvider";
import { lines } from "./PlayerRadar";
import { useFetchedJson } from "./useFetchedJson";
import "./playercompare.css";

const LEAGUES = ["nhl", "nba", "mlb", "nfl", "cfl"] as const;
const leagueName = (l: string) => (isLeague(l) ? LG[l] : l.toUpperCase());
const NOW = new Date().getFullYear();
const kindOf = (ref: string) => (["avg", "obp", "slg", "svp"].includes(ref) ? "rate3" : "rate2") as "rate3" | "rate2";

interface Found { id: number; name: string; position: string | null; positions: string[]; leagues: string[]; first_season: number | null; last_season: number | null }

/** The window: this player, the one chosen (or the picker), and the two side by side. */
export default function PlayerCompareDialog({ selfId, vs, onPick, onClose }: { selfId: number; vs: number | null; onPick: (id: number) => void; onClose: () => void }) {
  const { say } = useSpeaker();
  const dlg = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>("regular");
  const [group, setGroup] = useState("");
  const [changing, setChanging] = useState(false);
  const self = useFetchedJson<CompareData>(`/api/players/${selfId}/compare`, "player", true);
  const other = useFetchedJson<CompareData>(vs == null ? "" : `/api/players/${vs}/compare`, "player", vs != null);

  useEffect(() => { if (dlg.current && !dlg.current.open) dlg.current.showModal(); }, []);

  const a = useMemo(() => (self.data ? sideOf(self.data, phase) : null), [self.data, phase]);
  const b = useMemo(() => (other.data ? sideOf(other.data, phase) : null), [other.data, phase]);
  const common = useMemo(() => (a && b ? commonGroups(a, b) : []), [a, b]);
  const picking = vs == null || changing || other.state === "empty" || other.state === "failed";

  return (
    <dialog ref={dlg} className="mapdlg pcmp" aria-label={say("pcmp.title")} onClose={onClose} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <div className="dlghead">
        <h2>{say("pcmp.title")}</h2>
        <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
      </div>
      <div className="pcmp-heads">
        <Head data={self.data} state={self.state} />
        {vs != null && !picking ? <Head data={other.data} state={other.state} onChange={() => setChanging(true)} /> : (
          <div className="pcmp-head pcmp-choose">
            <h3>{say("pcmp.choose")}</h3>
            {self.data ? <Picker selfId={selfId} positions={self.data.positions} onPick={(id) => { setChanging(false); onPick(id); }} /> : <p className="note">{say("load.loading")}</p>}
            {vs != null && other.state === "failed" ? <p className="note" role="alert">{say("pcmp.failed")}</p> : null}
          </div>
        )}
      </div>
      {self.data && !self.data.board ? <p className="note">{say("pcmp.noRecord", { name: self.data.name })}</p> : null}
      {other.data && !other.data.board && !picking ? <p className="note">{say("pcmp.noRecord", { name: other.data.name })}</p> : null}
      {self.data && other.data && !picking ? (
        <Sides a={self.data} b={other.data} sa={a} sb={b} phase={phase} setPhase={setPhase} common={common} group={common.includes(group) ? group : (common[0] ?? "")} setGroup={setGroup} />
      ) : null}
    </dialog>
  );
}

function Head({ data, state, onChange }: { data: CompareData | null; state: string; onChange?: () => void }) {
  const { say } = useSpeaker();
  if (!data) return <div className="pcmp-head"><p className="note" role={state === "failed" ? "alert" : "status"}>{state === "failed" ? say("pcmp.failed") : say("load.loading")}</p></div>;
  const f = data.facts;
  const sub = [f.leagues.map(leagueName).join("/"), positionsShort(f.positions), f.first != null ? (f.last != null && f.last !== f.first ? `${f.first}–${f.last}` : String(f.first)) : ""].filter(Boolean).join(" · ");
  return (
    <div className="pcmp-head">
      <h3><Link href={data.path} prefetch={false}>{data.name}</Link></h3>
      {sub ? <p className="note">{sub}</p> : null}
      {onChange ? <button type="button" className="linkish" onClick={onChange}>{say("pcmp.pick.change")}</button> : null}
    </div>
  );
}

/** League, position and era menus and a name box over the players list; each choice narrows the same list of up to ten. */
function Picker({ selfId, positions, onPick }: { selfId: number; positions: CompareData["positions"]; onPick: (id: number) => void }) {
  const { say, locale, plural } = useSpeaker();
  const uid = useId();
  const [q, setQ] = useState("");
  const [league, setLeague] = useState("");
  const [position, setPosition] = useState("");
  const [decade, setDecade] = useState<number | null>(null);
  const [found, setFound] = useState<{ query: string; rows: Found[] } | null>(null);
  const query = pickerQuery({ q, league, position, decade });
  const choices = useMemo(() => positions.filter((p) => p[0] === league), [positions, league]);

  useEffect(() => {
    if (!query) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/players?${query}`, { signal: ctl.signal, headers: { accept: "application/json" } })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<{ data: Found[] }>; })
        .then((body) => setFound({ query, rows: body.data }))
        .catch(() => { if (!ctl.signal.aborted) setFound({ query, rows: [] }); });
    }, 200);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [query]);

  const rows = query && found?.query === query ? found.rows.filter((r) => r.id !== selfId) : null;
  const nameAt = (p: CompareData["positions"][number]) => (locale === "fr" ? p[3] : locale === "ja" ? p[4] : p[2]) || p[2];
  return (
    <div className="pcmp-picker">
      <div className="pcmp-menus">
        <label>
          <span>{say("pcmp.pick.league")}</span>
          <select value={league} onChange={(e) => { setLeague(e.target.value); setPosition(""); }}>
            <option value="">{say("pcmp.pick.anyLeague")}</option>
            {LEAGUES.map((l) => <option key={l} value={l}>{leagueName(l)}</option>)}
          </select>
        </label>
        <label>
          <span>{say("pcmp.pick.position")}</span>
          <select value={position} disabled={!league} onChange={(e) => setPosition(e.target.value)} title={league ? undefined : say("pcmp.pick.positionFirst")}>
            <option value="">{league ? say("pcmp.pick.anyPosition") : say("pcmp.pick.positionFirst")}</option>
            {choices.map((p) => <option key={p[1]} value={p[1]}>{p[1]} · {nameAt(p)}</option>)}
          </select>
        </label>
        <label>
          <span>{say("pcmp.pick.era")}</span>
          <select value={decade ?? ""} onChange={(e) => setDecade(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{say("pcmp.pick.anyEra")}</option>
            {decades(NOW).map((d) => <option key={d} value={d}>{say("pcmp.pick.decade", { decade: d })}</option>)}
          </select>
        </label>
      </div>
      <input
        type="search"
        aria-label={say("pcmp.pick.search")}
        placeholder={say("pcmp.pick.search")}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-controls={`${uid}-list`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && rows?.[0]) { e.preventDefault(); onPick(rows[0].id); } }}
      />
      {rows ? (
        <ul id={`${uid}-list`} className="pcmp-results">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(r.id)}>
                <b>{r.name}</b>
                <span>{[r.leagues.map(leagueName).join("/"), positionsShort(r.positions, r.position), r.first_season != null ? (r.last_season != null && r.last_season !== r.first_season ? `${r.first_season}–${r.last_season}` : String(r.first_season)) : ""].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="note" role="status">{!query ? say("pcmp.pick.hint") : rows == null ? say("load.loading") : rows.length ? plural("pcmp.pick.found", rows.length) : say("pcmp.pick.none")}</p>
    </div>
  );
}

function Cell({ win, side, children }: { win: Win; side: "a" | "b"; children: ReactNode }) {
  const { say } = useSpeaker();
  const best = win === side;
  return <td className={best ? "pcmp-win" : undefined}>{children}{best ? <span className="visually-hidden"> ({say("pcmp.better")})</span> : null}</td>;
}

function Row({ label, a, b, win, sub }: { label: ReactNode; a: ReactNode; b: ReactNode; win: Win; sub?: boolean }) {
  return (
    <tr className={sub ? "pcmp-sub" : undefined}>
      <th scope="row">{label}</th>
      <Cell win={win} side="a">{a}</Cell>
      <Cell win={win} side="b">{b}</Cell>
    </tr>
  );
}

function Sides({ a, b, sa, sb, phase, setPhase, common, group, setGroup }: {
  a: CompareData; b: CompareData; sa: Side | null; sb: Side | null; phase: Phase; setPhase: (p: Phase) => void; common: string[]; group: string; setGroup: (g: string) => void;
}) {
  const { say, fmt, dt, locale } = useSpeaker();
  const both = Boolean(sa && sb);
  const career = careerRows(a.board, b.board);
  const lines_ = both && group ? statLines(group, sa!, sb!) : [];
  const peak = both && group ? peakRow(group, sa!, sb!) : null;
  const radar = both && group ? radarPairs(group, sa!, sb!) : [];
  const def = sa?.groups.find((g) => g.def.id === group)?.def;
  const leagueOf = (s: Side | null) => s?.groups.find((g) => g.def.id === group)?.league ?? "";
  const dash = "–";
  const born = (d: CompareData) => [d.facts.born ? dt.ymd(atUtc(d.facts.born)) : null, d.facts.place].filter(Boolean).join(" · ") || dash;
  const country = (d: CompareData) => (d.facts.country ? countryName(d.facts.country, locale) : dash);
  const span = (d: CompareData) => (d.facts.first != null ? (d.facts.last != null && d.facts.last !== d.facts.first ? `${d.facts.first}–${d.facts.last}` : String(d.facts.first)) : dash);
  const int = (n: number | null) => (n == null ? dash : fmt(n));
  const peakCell = (p: { year: number; value: number } | null | undefined, lg: string) => (p && peak ? say("pcmp.peakCell", { season: seasonLabel(lg, p.year), value: showStat(peak.kind, p.value, fmt) }) : dash);

  return (
    <div className="pcmp-body">
      <div className="pcmp-controls">
        <div className="seg" role="group" aria-label={say("phase.aria")}>
          {(["regular", "playoffs"] as Phase[]).map((p) => (
            <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)}>{say(p === "regular" ? "phase.regular" : "phase.playoffs")}</button>
          ))}
        </div>
        {common.length > 1 ? (
          <div className="seg" role="group" aria-label={say("board.groupAria")}>
            {common.map((id) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)}>{say((sa!.groups.find((g) => g.def.id === id)!.def.title) as PhraseKey)}</button>)}
          </div>
        ) : null}
      </div>
      <div className="tablebox">
        <table className="pcmp-table">
          <thead>
            <tr><td /><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr>
          </thead>
          <tbody>
            <Row label={say("player.factBorn")} a={born(a)} b={born(b)} win={null} />
            <Row label={say("player.factCountry")} a={country(a)} b={country(b)} win={null} />
            <Row label={say("player.factPosition")} a={positionsShort(a.facts.positions) || dash} b={positionsShort(b.facts.positions) || dash} win={null} />
            <Row label={say("player.factHeight")} a={a.facts.heightCm ? `${a.facts.heightCm} cm (${inches(a.facts.heightCm)})` : dash} b={b.facts.heightCm ? `${b.facts.heightCm} cm (${inches(b.facts.heightCm)})` : dash} win={null} />
            <Row label={say("pcmp.row.leagues")} a={a.facts.leagues.map(leagueName).join(", ") || dash} b={b.facts.leagues.map(leagueName).join(", ") || dash} win={null} />
            <Row label={say("pcmp.row.span")} a={span(a)} b={span(b)} win={null} />
          </tbody>
          <tbody>
            <tr className="pcmp-group"><th scope="rowgroup" colSpan={3}>{say("pcmp.career")}</th></tr>
            {career.map((r) => <Row key={r.id} label={say(`pcmp.row.${r.id}` as PhraseKey)} a={int(r.a)} b={int(r.b)} win={r.win} />)}
          </tbody>
          {both && !common.length ? <tbody><tr><td colSpan={3} className="note">{say("pcmp.noCommon")}</td></tr></tbody> : null}
          {def ? (
            <tbody>
              <tr className="pcmp-group"><th scope="rowgroup" colSpan={3}>{say("pcmp.stats")}: {say(def.title as PhraseKey)}</th></tr>
              {lines_.flatMap((l) => {
                const name = say(l.title as PhraseKey);
                const rows = [<Row key={l.id} label={name} a={l.a == null ? dash : showStat(l.kind, l.a, fmt)} b={l.b == null ? dash : showStat(l.kind, l.b, fmt)} win={l.win} />];
                if (l.per) rows.push(<Row key={`${l.id}-per`} sub label={say(l.per.unit === "nine" ? "pcmp.perNine" : "pcmp.perGame", { stat: name })} a={l.per.a == null ? dash : l.per.a.toFixed(2)} b={l.per.b == null ? dash : l.per.b.toFixed(2)} win={l.per.win} />);
                return rows;
              })}
              {peak ? <Row label={`${say("pcmp.row.peak")}: ${say(peak.title as PhraseKey)}`} a={peakCell(peak.a, leagueOf(sa))} b={peakCell(peak.b, leagueOf(sb))} win={peak.win} /> : null}
            </tbody>
          ) : null}
          {def ? (
            <tbody>
              <tr className="pcmp-group"><th scope="rowgroup" colSpan={3}>{say("pcmp.radar")}</th></tr>
              {radar.length ? radar.map((p) => (
                <Row key={p.ref} label={say(p.label as PhraseKey)}
                  a={`${showStat(kindOf(p.ref), p.a.value, fmt)} · ${fmt(Math.round(p.a.pct * 100))}`}
                  b={`${showStat(kindOf(p.ref), p.b.value, fmt)} · ${fmt(Math.round(p.b.pct * 100))}`}
                  win={p.a.pct === p.b.pct ? "tie" : p.a.pct > p.b.pct ? "a" : "b"} />
              )) : <tr><td colSpan={3} className="note">{say("pcmp.radarNone")}</td></tr>}
            </tbody>
          ) : null}
        </table>
      </div>
      {radar.length >= 3 ? <CompareRadar pairs={radar} a={a.name} b={b.name} /> : null}
      {radar.length ? <p className="note">{say("pcmp.radarNote")}</p> : null}
    </div>
  );
}

const W = 420, H = 320, R = 96;

/** Both players' places among the league's players on the same axes: the first as a filled shape, the second as a dashed outline. */
function CompareRadar({ pairs, a, b }: { pairs: ReturnType<typeof radarPairs>; a: string; b: string }) {
  const { say } = useSpeaker();
  const cx = W / 2, cy = H / 2;
  const at = (i: number, f: number) => { const t = -Math.PI / 2 + (i / pairs.length) * Math.PI * 2; return [cx + Math.cos(t) * R * f, cy + Math.sin(t) * R * f] as const; };
  const shape = (pick: (p: (typeof pairs)[number]) => number) => pairs.map((p, i) => at(i, pick(p)).join(",")).join(" ");
  return (
    <figure className="pcmp-radar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("pcmp.radarAria")}>
        {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} className="ring" points={pairs.map((_, i) => at(i, f).join(",")).join(" ")} />)}
        {pairs.map((_, i) => <line key={i} className="spoke" x1={cx} y1={cy} x2={at(i, 1)[0]} y2={at(i, 1)[1]} />)}
        <polygon className="shape-a" points={shape((p) => p.a.pct)} />
        <polygon className="shape-b" points={shape((p) => p.b.pct)} />
        {pairs.map((p, i) => {
          const [lx, ly] = at(i, 1.18);
          const anchor = Math.abs(lx - cx) < 12 ? "middle" : lx > cx ? "start" : "end";
          const parts = lines(say(p.label as PhraseKey));
          return <text key={p.ref} className="axlab" x={lx} y={ly} textAnchor={anchor}>{parts.map((t, k) => <tspan key={k} x={lx} dy={k === 0 ? `${0.32 - (parts.length - 1) * 0.6}em` : "1.2em"}>{t}</tspan>)}</text>;
        })}
      </svg>
      <figcaption className="pcmp-key"><span className="ka">{a}</span><span className="kb">{b}</span></figcaption>
    </figure>
  );
}
