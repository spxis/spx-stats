"use client";

import { max, min, range } from "d3";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import {
  codeLabel, expandedLeagues, familiesWithData, familyHref, familyTitle, familyYearCell, heatCellColor,
  indexSeasons, memberHref, seasonHref, type LeagueFamily,
} from "@/lib/leagueFamilies";
import { useSpeaker } from "./i18n/LocaleProvider";
import { GrowToggle, useArchiveGrow } from "./archiveGrow";
import { useHeatCard } from "./HeatCard";
import { TipLines } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import { chooseRange, parseRange, releaseRangeHold, saveRange, serverRange, snapshotRange, subscribeRange, writeAddress } from "@/lib/yearRange";
import { YearRange } from "./YearRange";
import { useSeen } from "./useSeen";
import { unpackHeat, type HeatSeason, type HeatWire } from "@/lib/heatWire";

export type { HeatSeason };

const HeatRowsLazy = dynamic(() => import("./Heatmap").then((m) => m.HeatRows), { ssr: false });

const shareColor = (s: number) => (s <= 0 ? "transparent" : `color-mix(in srgb, var(--accent-cell) ${Math.round(18 + 82 * s)}%, transparent)`);

const LABEL_PX = 46; // the least room a year label gets
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50];
const ROW = 26;
const CHIP = 6;

/** The chart's width the least box is drawn at, and the height of a row and the year labels: the box keeps its size before the squares are drawn, so the page below does not jump. */
const MIN_W = 640;
const boxHeight = (rows: number, chips: boolean) => 22 + rows * (chips ? ROW + CHIP + 3 : ROW);

/**
 * Each square is a season, shaded by how many of its games have a result. A range slider narrows the years shown. The squares are a drawing with no words a
 * search needs and each is 400 bytes of markup, so the page sends the seasons as short plain data (`wire`, lib/heatWire.ts) and the chart is drawn in the browser.
 */
export function Heatmap({ wire }: { wire: HeatWire }) {
  const seasons = useMemo(() => unpackHeat(wire), [wire]);
  const [box, drawn] = useSeen<HTMLDivElement>();
  const { grown } = useArchiveGrow();
  const y0 = min(seasons, (s) => s.year) ?? 0, y1 = max(seasons, (s) => s.year) ?? 0;
  const families = useMemo(() => familiesWithData(seasons), [seasons]);
  const canGrow = families.some((f) => expandedLeagues(f, seasons).length > 1);
  const groups = grown ? undefined : families;
  const leagues = grown
    ? families.flatMap((f) => expandedLeagues(f, seasons))
    : families.map((f) => f.id);
  // The server draws the full range; the client then reads the range from the address or the saved one.
  const raw = useSyncExternalStore(subscribeRange, snapshotRange, serverRange);
  const span = useMemo(() => parseRange(raw, y0, y1) ?? { from: y0, to: y1 }, [raw, y0, y1]);
  // A saved range that came from storage is shown in the address too, so the page can be shared. The first (server-like) pass has nothing to write.
  useEffect(() => { if (raw) writeAddress(span, y0, y1); }, [raw, span, y0, y1]);
  // The head script keeps the chart hidden while a wanted range is pending; show it once this render uses that range (not the server's full one).
  useLayoutEffect(() => { if (raw === snapshotRange()) releaseRangeHold(); }, [raw]);
  const onRange = useCallback((from: number, to: number, final: boolean) => {
    chooseRange({ from, to });
    writeAddress({ from, to }, y0, y1);
    if (final) saveRange({ from, to }, y0, y1);
  }, [y0, y1]);
  const years = range(Math.max(span.from, y0), Math.min(span.to, y1) + 1);
  // A family label opens the family's page; a grown row opens that league. The full range leaves the address plain.
  const query = span.from <= y0 && span.to >= y1 ? "" : `?from=${span.from}&to=${span.to}`;
  const linkFor = useCallback((id: string) => {
    const fam = families.find((f) => f.id === id);
    return `${fam && !grown ? familyHref(fam) : memberHref(id)}${query}`;
  }, [families, grown, query]);
  return (
    <div className="yr-hold">
      <YearRange min={y0} max={y1} from={span.from} to={span.to} onChange={onRange} extra={<GrowToggle canGrow={canGrow} />} />
      <div ref={box} style={drawn ? undefined : { aspectRatio: `${MIN_W} / ${boxHeight(leagues.length, !!groups)}`, maxHeight: boxHeight(leagues.length, !!groups) }}>
        {drawn ? <HeatRowsLazy seasons={seasons} leagues={leagues} years={years} labels linkFor={linkFor} groups={groups} /> : null}
      </div>
    </div>
  );
}

/** The rows of the chart: a square per season, a label per league (a link when `linkFor` gives its address).
 *  When `groups` is set, each `leagues` id is a family and a year may carry smaller sibling chips underneath. */
export function HeatRows({ seasons, leagues, years, labels = false, linkFor, groups }: {
  seasons: HeatSeason[]; leagues: string[]; years: number[]; labels?: boolean; linkFor?: (league: string) => string; groups?: readonly LeagueFamily[];
}) {
  const router = useRouter();
  const { say, fmt } = useSpeaker();
  const soccerWord = say("nav.soccer");
  const internationalWord = say("nav.international");
  const [ref, W] = useChartWidth(1180, 300);
  const card = useHeatCard();
  const touched = useRef(false); // the last press on a square was a finger's: a first tap shows the card, a second opens the season
  const [picked, setPicked] = useState<string | null>(null); // the square the keyboard last stood on: the chart's one tab stop

  const byLeague = useMemo(() => indexSeasons(seasons), [seasons]);
  const familyOfRow = useMemo(() => {
    if (!groups) return new Map<string, LeagueFamily>();
    return new Map(groups.map((f) => [f.id, f]));
  }, [groups]);

  // One height for every row: if any family shows sibling chips, all rows make room for them.
  const anyChips = [...familyOfRow.values()].some((fam) => years.some((y) => (familyYearCell(y, fam, byLeague)?.chips.length ?? 0) > 0));
  const rowHOf = () => (anyChips ? ROW + CHIP + 3 : ROW);
  const rowHs = leagues.map(rowHOf);
  const rowTop = (i: number) => rowHs.slice(0, i).reduce((n, h) => n + h, 0);

  const left = labels ? 58 : 0, top = 18;
  // Few years need less width to read; the full range keeps the old 640 minimum. A lone row has no minimum: its squares shrink to fit.
  const Wd = labels ? Math.max(W, Math.min(MIN_W, left + years.length * 10)) : W;
  const cw = (Wd - left) / Math.max(1, years.length);
  const x = (y: number) => left + (y - years[0]) * cw;
  const step = TICK_STEPS.find((n) => n * cw >= LABEL_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks = years.filter((y) => y % step === 0);
  const bodyH = rowHs.reduce((n, h) => n + h, 0);
  const H = top + bodyH + 4;

  const nameOf = (id: string) => {
    const fam = familyOfRow.get(id);
    return fam ? (fam.chart ? `${fam.chart}${fam.plus ? "+" : ""}` : familyTitle(fam, soccerWord)) : codeLabel(id, internationalWord);
  };
  const cardOf = (lg: string, s: HeatSeason) => ({
    title: `${codeLabel(lg, internationalWord)} ${s.label}`,
    lines: [
      s.games ? say("heatmap.share", { finals: fmt(s.finals), games: fmt(s.games) }) : s.champion ? say("noseason.awards") : say("noseason.league"),
      s.champion ? say("tip.champion", { team: s.champion }) : null,
    ].filter((l): l is string => !!l),
  });
  const keyOf = (lg: string, yr: number) => `${lg}:${yr}`;
  const cellsIn = (id: string): { lg: string; yr: number }[] => {
    const fam = familyOfRow.get(id);
    if (!fam) return years.filter((y) => byLeague.get(id)?.has(y)).map((yr) => ({ lg: id, yr }));
    return years.flatMap((yr) => {
      const cell = familyYearCell(yr, fam, byLeague);
      return cell ? [{ lg: cell.main.league, yr }, ...cell.chips.map((c) => ({ lg: c.league, yr }))] : [];
    });
  };
  const inRow = (id: string) => [...new Set(cellsIn(id).map((c) => c.yr))];
  // Tab reaches one square of the chart (the last one the arrows stood on, else the first); the arrow keys move among the rest.
  const allKeys = leagues.flatMap((id) => cellsIn(id).map((c) => keyOf(c.lg, c.yr)));
  const stop = picked && allKeys.includes(picked) ? picked : allKeys[0] ?? null;

  const focusSquare = (lg: string, yr: number) => {
    setPicked(keyOf(lg, yr));
    ref.current?.querySelector<SVGRectElement>(`[data-heat="${keyOf(lg, yr)}"]`)?.focus();
  };
  const onKey = (ev: KeyboardEvent<SVGRectElement>, rowId: string, lg: string, yr: number) => {
    let to: [string, number] | undefined;
    const rowYears = inRow(rowId);
    if (ev.key === "ArrowLeft") { const y = rowYears.filter((v) => v < yr).pop(); if (y !== undefined) to = [mainOf(rowId, y), y]; }
    else if (ev.key === "ArrowRight") { const y = rowYears.find((v) => v > yr); if (y !== undefined) to = [mainOf(rowId, y), y]; }
    else if (ev.key === "Home") { const y = rowYears[0]; if (y !== undefined) to = [mainOf(rowId, y), y]; }
    else if (ev.key === "End") { const y = rowYears.at(-1); if (y !== undefined) to = [mainOf(rowId, y), y]; }
    else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      const dir = ev.key === "ArrowUp" ? -1 : 1;
      for (let r = leagues.indexOf(rowId) + dir; r >= 0 && r < leagues.length; r += dir) {
        const near = inRow(leagues[r]).slice().sort((a, b) => Math.abs(a - yr) - Math.abs(b - yr))[0];
        if (near !== undefined) { to = [mainOf(leagues[r], near), near]; break; }
      }
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      router.push(seasonHref(lg, yr));
      return;
    } else return;
    ev.preventDefault();
    if (to) focusSquare(to[0], to[1]);
  };
  function mainOf(rowId: string, yr: number): string {
    const fam = familyOfRow.get(rowId);
    return fam ? (familyYearCell(yr, fam, byLeague)?.main.league ?? rowId) : rowId;
  }
  const showCard = (el: Element, lg: string, s: HeatSeason) => {
    const c = cardOf(lg, s);
    card.show(el, <TipLines title={c.title} lines={c.lines} />);
  };
  const onClick = (ev: MouseEvent<SVGRectElement>, lg: string, s: HeatSeason) => {
    if (touched.current && card.shownOn() !== ev.currentTarget) { showCard(ev.currentTarget, lg, s); return; }
    router.push(seasonHref(lg, s.year));
  };

  const square = (lg: string, s: HeatSeason, rowId: string, box: { x: number; y: number; w: number; h: number }, k: string) => {
    const c = cardOf(lg, s);
    return (
      <rect key={k} data-season={s.year} data-heat={k} data-lg={lg} x={box.x} y={box.y} width={box.w} height={box.h}
        role="link" tabIndex={k === stop ? 0 : -1} aria-label={[c.title, ...c.lines].join(". ")}
        fill={s.games === 0 && !s.champion ? "var(--soft)" : shareColor(s.share)} stroke={s.share > 0 ? "none" : "var(--rule)"} strokeWidth={0.5}
        style={{ cursor: "pointer", color: heatCellColor(lg), "--accent-cell": heatCellColor(lg) } as React.CSSProperties}
        onPointerDown={(ev: PointerEvent) => { touched.current = ev.pointerType === "touch"; }}
        onClick={(ev) => onClick(ev, lg, s)}
        onKeyDown={(ev) => onKey(ev, rowId, lg, s.year)}
        onPointerEnter={(ev) => { if (ev.pointerType !== "touch") showCard(ev.currentTarget, lg, s); }}
        onPointerLeave={(ev) => { if (ev.pointerType !== "touch") card.hide(); }}
        onFocus={(ev) => {
          setPicked(k);
          if (ev.currentTarget.matches(":focus-visible")) showCard(ev.currentTarget, lg, s);
        }}
        onBlur={(ev) => { if (card.shownOn() === ev.currentTarget) card.hide(); }} />
    );
  };

  return (
    <div className="chart scroll" ref={ref}>
      <svg viewBox={`0 0 ${Wd} ${H}`} role="group" aria-label={say("heatmap.aria")}>
        <g>{ticks.map((y) => <text key={y} x={x(y)} y={11} textAnchor={!labels && x(y) + 30 > Wd ? "end" : undefined}>{y}</text>)}</g>
        <g>{ticks.map((y) => <line key={y} x1={x(y)} x2={x(y)} y1={top - 3} y2={top + bodyH} stroke="var(--rule)" />)}</g>
        {leagues.map((id, i) => {
          const fam = familyOfRow.get(id);
          const rh = rowHs[i];
          const name = nameOf(id);
          return (
            <g key={id} transform={`translate(0,${top + rowTop(i)})`}>
              {labels ? (linkFor ? <LeagueLabel name={name} href={linkFor(id)} h={rh} w={left} /> : <text className="lab" x={0} y={rh / 2 + 5}>{name}</text>) : null}
              {years.map((yr) => {
                if (fam) {
                  const cell = familyYearCell(yr, fam, byLeague);
                  if (!cell) return null;
                  const chipBand = cell.chips.length ? CHIP + 1 : 0;
                  const mainH = Math.max(4, rh - 6 - chipBand);
                  const main = square(cell.main.league, cell.main, id, { x: x(yr) + 0.5, y: 3, w: Math.max(1, cw - 1), h: mainH }, keyOf(cell.main.league, yr));
                  if (!cell.chips.length) return main;
                  const n = cell.chips.length;
                  const gap = 0.4;
                  const chipW = Math.max(1, (cw - 1 - gap * (n - 1)) / n);
                  return (
                    <g key={yr}>
                      {main}
                      {cell.chips.map((ch, ci) => square(ch.league, ch, id, {
                        x: x(yr) + 0.5 + ci * (chipW + gap), y: 3 + mainH + 1, w: chipW, h: CHIP,
                      }, keyOf(ch.league, yr)))}
                    </g>
                  );
                }
                const s = byLeague.get(id)?.get(yr);
                if (!s) return null;
                return square(id, s, id, { x: x(yr) + 0.5, y: 3, w: Math.max(1, cw - 1), h: rh - 6 }, keyOf(id, yr));
              })}
            </g>
          );
        })}
      </svg>
      {card.element}
    </div>
  );
}

/** A league's name at the head of its row, linking to its page; the clear box behind the text makes a bigger target. */
function LeagueLabel({ name, href, h, w }: { name: string; href: string; h: number; w: number }) {
  const router = useRouter();
  return (
    <a href={href} className="leaguelink" onClick={(ev) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      router.push(href);
    }}>
      <rect x={0} y={0} width={w} height={h} fill="transparent" />
      <text className="lab" x={0} y={Math.min(h / 2 + 5, h - 4)}>{name}</text>
    </a>
  );
}
