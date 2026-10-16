"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import Link from "@/components/Link";
import { fmt3 } from "@/lib/format";
import { LG, seasonLabel, type LeagueCode } from "@/lib/leagues";
import {
  MIN_GAMES, buildGrid, choiceQuery, defaultDir, readChoice, sortRows, winShare,
  type HeatChoice, type HeatDir, type HeatOpp, type HeatPhase, type HeatRow, type HeatSort, type OpponentHeatView, type Rec,
} from "@/lib/opponentHeat";
import { replaceQuery } from "@/lib/urlQuery";
import { useHeatCard } from "./HeatCard";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines } from "./Tooltip";
import "./opheat.css";

// The toggles live in the address (?hphase=&hsort=&hdir=&hlg=&hmin=) and are read here, in the browser: the team page stays one kept copy and a choice costs the server nothing.
const listeners = new Set<() => void>();
const snapshot = () => window.location.search;
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => { listeners.delete(cb); window.removeEventListener("popstate", cb); };
}
function change(changes: Record<string, string | null>) {
  replaceQuery(changes);
  listeners.forEach((cb) => cb());
}

/** A square's colour: blue where the club won more than half its games, red where it won fewer, the neutral middle at an even split. */
function tone(share: number): string {
  const d = Math.abs(share - 0.5) * 2;
  if (d === 0) return "var(--hm-mid)";
  return `color-mix(in srgb, var(${share > 0.5 ? "--hm-win" : "--hm-loss"}) ${Math.round(14 + 76 * d)}%, var(--hm-mid))`;
}

const recText = (r: Rec): string => `${r.w}-${r.l}${r.t || r.otl ? `-${r.t}` : ""}${r.otl ? `-${r.otl}` : ""}`;
const TICK = 5;
const cellKey = (key: number, y: number) => `${key}:${y}`;

/**
 * A team's record against every opponent: rows are opponents, columns are seasons, a square is coloured by the share of games won (a tie is half) and
 * left plain where the two did not meet. The first column is the all-time record. Hover, focus or a first tap shows the record; a click (or a second
 * tap, or Enter) opens that season's games on the head-to-head page. The part of the season, the order of the rows, the league (for a club that changed
 * leagues) and the least games against an opponent are chosen above the chart and kept in the address.
 */
export function OpponentHeat({ view }: { view: OpponentHeatView }) {
  const { say, fmt } = useSpeaker();
  const router = useRouter();
  const card = useHeatCard();
  const box = useRef<HTMLDivElement | null>(null);
  const touched = useRef(false); // the last press was a finger's: a first tap shows the card, a second opens the games
  const lit = useRef<{ row: Element | null; head: Element | null }>({ row: null, head: null });
  const [picked, setPicked] = useState<string | null>(null); // the square the keyboard last stood on: the chart's one tab stop

  const def = view.leagues.includes(view.lg) ? view.lg : view.leagues[0] ?? view.lg;
  const search = useSyncExternalStore(subscribe, snapshot, () => "");
  const c = useMemo(() => readChoice(search, view.leagues, def), [search, view.leagues, def]);
  const set = useCallback((next: Partial<HeatChoice>) => change(choiceQuery({ ...c, ...next }, def)), [c, def]);

  const fallback = useCallback((o: HeatOpp) => say("team.fallback", { id: o.f }), [say]);
  const grid = useMemo(() => buildGrid(view, c.phase, c.league), [view, c.phase, c.league]);
  const rows = useMemo(() => sortRows(grid.rows.filter((r) => r.life.gp >= c.min), c.sort, c.dir, fallback), [grid, c.min, c.sort, c.dir, fallback]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const phaseQuery = c.phase === "all" ? "" : `phase=${c.phase}`;
  const gamesHref = (o: HeatOpp, y: number) =>
    y ? `${o.pair}?season=${seasonLabel(o.lg, y)}${phaseQuery ? `&${phaseQuery}` : ""}` : `${o.pair}${phaseQuery ? `?${phaseQuery}` : ""}`;
  const nameOf = (o: HeatOpp) => o.name ?? fallback(o);

  const cardOf = useCallback((row: HeatRow, y: number) => {
    const r = y ? row.by.get(y)! : row.life;
    const name = row.opp.name ?? fallback(row.opp);
    const phaseNote = c.phase === "all" ? "" : ` · ${say(c.phase === "regular" ? "phase.regular" : "phase.playoffs")}`;
    const words = (x: Rec) => [`${x.w} ${say("result.w")}`, `${x.l} ${say("result.l")}`, x.t ? `${x.t} ${say("result.t")}` : "", x.otl ? `${x.otl} ${say("result.otl")}` : ""].filter(Boolean).join(" · ");
    const share = winShare(r);
    const diff = r.pf - r.pa;
    const title = (y ? say("opheat.card.season", { name, season: seasonLabel(row.opp.lg, y) }) : say("opheat.card.all", { name })) + phaseNote;
    return {
      title,
      lines: [
        say("opheat.card.record", { record: words(r) }),
        say("opheat.card.games", { games: fmt(r.gp) }),
        share == null ? null : say("opheat.card.share", { pct: fmt3(share) }),
        say("opheat.card.score", { pf: fmt(r.pf), pa: fmt(r.pa), diff: `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmt(Math.abs(diff))}` }),
      ].filter((l): l is string => !!l),
    };
  }, [c.phase, say, fmt, fallback]);
  // The words each square says to a screen reader, worked out when the data or the part of the season changes, not on every sort.
  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of grid.rows) for (const y of [0, ...row.by.keys()]) { const k = cardOf(row, y); m.set(cellKey(row.key, y), [k.title, ...k.lines].join(". ")); }
    return m;
  }, [grid, cardOf]);
  const showCard = (el: Element, row: HeatRow, y: number, hint: boolean) => {
    const k = cardOf(row, y);
    card.show(el, <TipLines title={k.title} lines={[...k.lines, hint ? say(touched.current ? "opheat.card.hintTouch" : "opheat.card.hint") : null]} />);
  };

  // The row and the season under the pointer or the keyboard are shaded, so a square is easy to follow back to its opponent and year.
  const light = (el: Element | null) => {
    lit.current.row?.classList.remove("hl");
    lit.current.head?.classList.remove("hl");
    lit.current = { row: null, head: null };
    if (!el) return;
    const row = el.closest(".ohrow");
    const y = (el as HTMLElement).dataset.y;
    const head = y && y !== "0" ? box.current?.querySelector(`[data-yh="${y}"]`) ?? null : null;
    row?.classList.add("hl");
    head?.classList.add("hl");
    lit.current = { row: row ?? null, head };
  };
  const target = (ev: { target: EventTarget }): { el: HTMLElement; row: HeatRow; y: number } | null => {
    const el = (ev.target as Element).closest<HTMLElement>("[data-oc]");
    if (!el) return null;
    const row = byKey.get(Number(el.dataset.r));
    return row ? { el, row, y: Number(el.dataset.y) } : null;
  };

  const onOver = (ev: PointerEvent<HTMLDivElement>) => {
    if (ev.pointerType === "touch") return;
    const t = target(ev);
    if (!t) { card.hide(); light(null); return; }
    showCard(t.el, t.row, t.y, true);
    light(t.el);
  };
  const onLeave = (ev: PointerEvent<HTMLDivElement>) => {
    if (ev.pointerType === "touch") return;
    card.hide();
    light(null);
  };
  const onClick = (ev: MouseEvent<HTMLDivElement>) => {
    const t = target(ev);
    if (!t) return;
    if (touched.current && card.shownOn() !== t.el) { showCard(t.el, t.row, t.y, true); light(t.el); return; }
    router.push(gamesHref(t.row.opp, t.y));
  };
  const colsOf = (row: HeatRow) => [0, ...[...row.by.keys()].sort((a, b) => a - b)];
  const focusCell = (row: HeatRow, y: number) => {
    setPicked(cellKey(row.key, y));
    box.current?.querySelector<HTMLElement>(`[data-oc="${cellKey(row.key, y)}"]`)?.focus();
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const t = target(ev);
    if (!t) return;
    const cols = colsOf(t.row), at = cols.indexOf(t.y), ri = rows.indexOf(t.row);
    let to: [HeatRow, number] | undefined;
    const rowAt = (i: number): [HeatRow, number] | undefined => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (!r || r === t.row) return undefined;
      const cs = colsOf(r);
      return [r, t.y === 0 ? 0 : cs.slice(1).sort((a, b) => Math.abs(a - t.y) - Math.abs(b - t.y))[0]];
    };
    if (ev.key === "ArrowLeft") { if (at > 0) to = [t.row, cols[at - 1]]; }
    else if (ev.key === "ArrowRight") { if (at < cols.length - 1) to = [t.row, cols[at + 1]]; }
    else if (ev.key === "Home") { if (at > 0) to = [t.row, cols[0]]; }
    else if (ev.key === "End") { if (at < cols.length - 1) to = [t.row, cols[cols.length - 1]]; }
    else if (ev.key === "ArrowUp") to = rowAt(ri - 1);
    else if (ev.key === "ArrowDown") to = rowAt(ri + 1);
    else if (ev.key === "PageUp") to = rowAt(ri - 10);
    else if (ev.key === "PageDown") to = rowAt(ri + 10);
    else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); router.push(gamesHref(t.row.opp, t.y)); return; }
    else return;
    ev.preventDefault();
    if (to) focusCell(to[0], to[1]);
  };
  const onFocus = (ev: React.FocusEvent<HTMLDivElement>) => {
    const t = target(ev);
    if (!t) return;
    setPicked(cellKey(t.row.key, t.y));
    // Only a keyboard's arrival shows the card: a press that happens to focus the square must not (a first tap would open the games).
    if (t.el.matches(":focus-visible")) { showCard(t.el, t.row, t.y, true); light(t.el); }
  };
  const onBlur = (ev: React.FocusEvent<HTMLDivElement>) => {
    const t = target(ev);
    if (t && card.shownOn() === t.el) { card.hide(); light(null); }
  };

  const stop = picked && byKey.has(Number(picked.split(":")[0])) && (picked.endsWith(":0") || byKey.get(Number(picked.split(":")[0]))!.by.has(Number(picked.split(":")[1])))
    ? picked
    : rows[0] ? cellKey(rows[0].key, 0) : null;

  const sortBy = (s: HeatSort) => set(c.sort === s ? { dir: c.dir === "asc" ? "desc" : "asc" } : { sort: s, dir: defaultDir(s) });
  const phases: [HeatPhase, string][] = [["all", "phase.all"], ["regular", "phase.regular"], ["playoffs", "phase.playoffs"]];
  const sorts: [HeatSort, string][] = [["pct", "opheat.sort.pct"], ["games", "opheat.sort.games"], ["name", "opheat.sort.name"]];
  const arrow = (d: HeatDir) => (d === "asc" ? "▲" : "▼");

  return (
    <div className="oh" ref={box}>
      <div className="ohcontrols">
        <div className="seg" role="group" aria-label={say("phase.aria")}>
          {phases.map(([p, label]) => <button key={p} type="button" aria-pressed={c.phase === p} onClick={() => set({ phase: p })}>{say(label as "phase.all")}</button>)}
        </div>
        <div className="grp">
          <span className="lbl" id="oh-sort">{say("opheat.sortLabel")}</span>
          <div className="seg" role="group" aria-labelledby="oh-sort">
            {sorts.map(([s, label]) => (
              <button key={s} type="button" aria-pressed={c.sort === s} onClick={() => sortBy(s)}
                aria-label={c.sort === s ? `${say(label as "opheat.sort.pct")}, ${say(c.dir === "asc" ? "opheat.dir.asc" : "opheat.dir.desc")}` : undefined}>
                {say(label as "opheat.sort.pct")}{c.sort === s ? <span className="dir" aria-hidden="true">{arrow(c.dir)}</span> : null}
              </button>
            ))}
          </div>
        </div>
        {view.leagues.length > 1 ? (
          <div className="seg" role="group" aria-label={say("opheat.leagueLabel")}>
            {view.leagues.map((l) => <button key={l} type="button" aria-pressed={c.league === l} onClick={() => set({ league: l })}>{LG[l as LeagueCode] ?? l.toUpperCase()}</button>)}
            <button type="button" aria-pressed={c.league === null} onClick={() => set({ league: null })}>{say("opheat.league.all")}</button>
          </div>
        ) : null}
        <label className="grp">
          <span className="lbl">{say("opheat.minLabel")}</span>
          <select value={c.min} onChange={(ev) => set({ min: Number(ev.target.value) })}>
            {MIN_GAMES.map((n) => <option key={n} value={n}>{n ? say("opheat.min.n", { n: fmt(n) }) : say("opheat.min.any")}</option>)}
          </select>
        </label>
      </div>
      <div className="ohlegend" aria-hidden="true">
        <span className="ramp">{say("opheat.legend.loss")}<i className="bar" />{say("opheat.legend.win")}</span>
        <span className="none"><i />{say("opheat.legend.none")}</span>
      </div>
      {rows.length ? (
        <div className="ohscroll">
          <div className="ohgrid" role="grid" aria-label={say("opheat.aria")} aria-rowcount={rows.length + 1}
            onPointerOver={onOver} onPointerLeave={onLeave} onPointerDown={(ev) => { touched.current = ev.pointerType === "touch"; }}
            onClick={onClick} onKeyDown={onKey} onFocus={onFocus} onBlur={onBlur}>
            <div role="row" className="ohrow ohhead">
              <div role="columnheader" className="ohname">{say("opheat.opponent")}</div>
              <div role="columnheader" className="ohlife">{say("opheat.life")}</div>
              {grid.years.map((y) => (
                <div role="columnheader" key={y} className={y % TICK === 0 ? "ohc tick" : "ohc"} data-yh={y} aria-label={seasonLabel(view.lg, y)}>
                  {y % TICK === 0 ? <span aria-hidden="true">{y}</span> : null}
                </div>
              ))}
            </div>
            {rows.map((row) => {
              const name = nameOf(row.opp), k0 = cellKey(row.key, 0), share = winShare(row.life) ?? 0;
              return (
                <div role="row" className="ohrow" key={row.key}>
                  <div role="rowheader" className="ohname">
                    <Link href={row.opp.href} prefetch={false} title={name}>{name}</Link>
                    {row.opp.lg !== view.lg || (c.league === null && view.leagues.length > 1) ? <span className="tag">{LG[row.opp.lg as LeagueCode] ?? row.opp.lg.toUpperCase()}</span> : null}
                  </div>
                  <div role="gridcell" className="ohlife" data-oc={k0} data-r={row.key} data-y={0} tabIndex={k0 === stop ? 0 : -1}
                    aria-label={labels.get(k0)}>
                    <div className="rec"><b>{recText(row.life)}</b><span>{fmt3(share)}</span></div>
                    <div className="bar"><i style={{ left: `${Math.min(share, 0.5) * 100}%`, width: `${Math.abs(share - 0.5) * 100}%`, background: tone(share) }} /></div>
                  </div>
                  {grid.years.map((y) => {
                    const r = row.by.get(y);
                    if (!r) return <div role="gridcell" className="ohc n" key={y} aria-hidden="true" />;
                    const k = cellKey(row.key, y);
                    return (
                      <div role="gridcell" className="ohc y" key={y} data-oc={k} data-r={row.key} data-y={y} tabIndex={k === stop ? 0 : -1}
                        style={{ background: tone(winShare(r) ?? 0.5) }} aria-label={labels.get(k)} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : <p className="ohempty">{say("opheat.empty")}</p>}
      <p className="note ohnote">
        {rows.length < grid.rows.length ? `${say("opheat.count", { shown: fmt(rows.length), total: fmt(grid.rows.length) })} · ` : ""}{say("opheat.keys")}
      </p>
      {card.element}
    </div>
  );
}
