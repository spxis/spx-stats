"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LG, seasonLabel } from "@/lib/leagues";
import { useHeatCard } from "./HeatCard";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import { TipLines } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./city.css";

/** One club's seasons in the city: [year, champion (0 or 1), wins, losses, ties, overtime losses], oldest first (a missing record is -1). */
export interface TimelineClub { key: string; league: string; f: number; name: string; seasons: [number, number, number, number, number, number][] }

const LABEL = 150, LABEL_SMALL = 104, ROW = 22, TOP = 20;
const STEPS = [1, 2, 5, 10, 20, 25, 50];

/**
 * Which clubs existed when: a row for each club that played in the city, a square for each season it spent there, in its league's colour,
 * with a ring on the seasons it won the title. Pressing a square opens that club's season; hovering, tapping or tabbing to one shows the
 * season and the record. Tab reaches the chart once; the arrow keys move between squares.
 */
export function CityTimeline({ clubs }: { clubs: TimelineClub[] }) {
  const router = useRouter();
  const paths = usePaths();
  const { say } = useSpeaker();
  const [ref, W] = useChartWidth(900, 280);
  const card = useHeatCard();
  const touched = useRef(false);
  const [picked, setPicked] = useState<string | null>(null);
  if (!clubs.length) return null;

  const years = clubs.flatMap((c) => c.seasons.map((s) => s[0]));
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const left = W < 480 ? LABEL_SMALL : LABEL;
  const span = y1 - y0 + 1;
  const Wd = Math.max(W, left + span * 4);
  const cw = (Wd - left) / span;
  const x = (y: number) => left + (y - y0) * cw;
  const step = STEPS.find((n) => n * cw >= 44) ?? 50;
  const ticks = Array.from({ length: span }, (_, i) => y0 + i).filter((y) => y % step === 0);
  const H = TOP + ROW * clubs.length + 4;
  const keyOf = (c: TimelineClub, y: number) => `${c.key}:${y}`;
  const first = clubs[0] && keyOf(clubs[0], clubs[0].seasons[0][0]);
  const stop = picked ?? first;

  const record = (s: TimelineClub["seasons"][number]) => (s[2] < 0 ? "" : [s[2], s[3], ...(s[4] ? [s[4]] : []), ...(s[5] ? [s[5]] : [])].join("-"));
  const cardOf = (c: TimelineClub, s: TimelineClub["seasons"][number]) => ({
    title: `${c.name} · ${LG[c.league as keyof typeof LG]} ${seasonLabel(c.league, s[0])}`,
    lines: [s[1] ? say("trophy.champion") : null, record(s) ? say("timeline.record", { record: record(s) }) : say("timeline.noRecord")],
  });
  const show = (el: Element, c: TimelineClub, s: TimelineClub["seasons"][number]) => {
    const t = cardOf(c, s);
    card.show(el, <TipLines title={t.title} lines={t.lines} />);
  };
  const focusSquare = (k: string) => {
    setPicked(k);
    ref.current?.querySelector<SVGRectElement>(`[data-heat="${CSS.escape(k)}"]`)?.focus();
  };
  const onKey = (ev: KeyboardEvent<SVGRectElement>, ri: number, y: number) => {
    const row = clubs[ri].seasons.map((s) => s[0]);
    let to: string | undefined;
    if (ev.key === "ArrowLeft") { const v = row.filter((a) => a < y).pop(); if (v !== undefined) to = keyOf(clubs[ri], v); }
    else if (ev.key === "ArrowRight") { const v = row.find((a) => a > y); if (v !== undefined) to = keyOf(clubs[ri], v); }
    else if (ev.key === "Home") to = keyOf(clubs[ri], row[0]);
    else if (ev.key === "End") to = keyOf(clubs[ri], row[row.length - 1]);
    else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      const r = ri + (ev.key === "ArrowUp" ? -1 : 1);
      const near = clubs[r]?.seasons.map((s) => s[0]).sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0];
      if (near !== undefined) to = keyOf(clubs[r], near);
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      router.push(paths.teamSeason(clubs[ri].league, clubs[ri].f, y));
      return;
    } else return;
    ev.preventDefault();
    if (to) focusSquare(to);
  };

  return (
    <div className="chart scroll citytimeline" ref={ref}>
      <svg viewBox={`0 0 ${Wd} ${H}`} role="group" aria-label={say("timeline.aria")}>
        <g>{ticks.map((y) => <text key={y} x={x(y)} y={12}>{y}</text>)}</g>
        <g>{ticks.map((y) => <line key={y} x1={x(y)} x2={x(y)} y1={TOP - 3} y2={TOP + ROW * clubs.length} stroke="var(--rule)" />)}</g>
        {clubs.map((c, ri) => (
          <g key={c.key} transform={`translate(0,${TOP + ri * ROW})`} style={{ "--accent-cell": `var(--${c.league})` } as React.CSSProperties}>
            <a href={paths.team(c.league, c.f)} className="leaguelink" onClick={(ev) => {
              if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
              ev.preventDefault();
              router.push(paths.team(c.league, c.f));
            }}>
              <rect x={0} y={0} width={left - 6} height={ROW} fill="transparent" />
              <text className="clubname" x={0} y={ROW / 2 + 4}>{trim(c.name, left < LABEL ? 15 : 22)}<title>{`${c.name} · ${LG[c.league as keyof typeof LG]}`}</title></text>
            </a>
            {c.seasons.map((s) => {
              const k = keyOf(c, s[0]), t = cardOf(c, s);
              return (
                <g key={s[0]}>
                  <rect data-heat={k} x={x(s[0]) + 0.5} y={3} width={Math.max(1, cw - 1)} height={ROW - 6}
                    role="link" tabIndex={k === stop ? 0 : -1} aria-label={[t.title, ...t.lines.filter(Boolean)].join(". ")}
                    fill={`color-mix(in srgb, var(--accent-cell) ${s[2] < 0 ? 30 : 78}%, transparent)`} style={{ cursor: "pointer" }}
                    onPointerDown={(ev: PointerEvent) => { touched.current = ev.pointerType === "touch"; }}
                    onClick={(ev) => {
                      if (touched.current && card.shownOn() !== ev.currentTarget) { show(ev.currentTarget, c, s); return; }
                      router.push(paths.teamSeason(c.league, c.f, s[0]));
                    }}
                    onKeyDown={(ev) => onKey(ev, ri, s[0])}
                    onPointerEnter={(ev) => { if (ev.pointerType !== "touch") show(ev.currentTarget, c, s); }}
                    onPointerLeave={(ev) => { if (ev.pointerType !== "touch") card.hide(); }}
                    onFocus={(ev) => { setPicked(k); if (ev.currentTarget.matches(":focus-visible")) show(ev.currentTarget, c, s); }}
                    onBlur={(ev) => { if (card.shownOn() === ev.currentTarget) card.hide(); }} />
                  {s[1] ? <circle cx={x(s[0]) + cw / 2} cy={ROW / 2} r={Math.min(4, Math.max(1.5, cw / 2 - 0.5))} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1} pointerEvents="none" /> : null}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {card.element}
    </div>
  );
}

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
