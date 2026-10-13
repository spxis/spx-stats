"use client";

import { max, min, range } from "d3";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { LG } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import { seasonPath } from "@/lib/slug";
import { chooseRange, parseRange, releaseRangeHold, saveRange, serverRange, snapshotRange, subscribeRange, writeAddress } from "@/lib/yearRange";
import { YearRange } from "./YearRange";

export interface HeatSeason {
  league: string; year: number; label: string; games: number; finals: number; share: number; champion: string | null;
}

const shareColor = (s: number) => (s <= 0 ? "transparent" : `color-mix(in srgb, var(--accent-cell) ${Math.round(18 + 82 * s)}%, transparent)`);

const LABEL_PX = 46; // the least room a year label gets
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50];

/** Each square is a season, shaded by how many of its games have a result. A range slider narrows the years shown. */
export function Heatmap({ seasons, leagues }: { seasons: HeatSeason[]; leagues: string[] }) {
  const router = useRouter();
  const { say, fmt } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const y0 = min(seasons, (s) => s.year) ?? 0, y1 = max(seasons, (s) => s.year) ?? 0;
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

  // Seasons by league and year, built once; dragging only changes which years are drawn.
  const byLeague = useMemo(() => {
    const m = new Map<string, Map<number, HeatSeason>>();
    for (const s of seasons) {
      let row = m.get(s.league);
      if (!row) m.set(s.league, (row = new Map()));
      row.set(s.year, s);
    }
    return m;
  }, [seasons]);

  const years = range(Math.max(span.from, y0), Math.min(span.to, y1) + 1);
  const left = 46, rowH = 26, top = 18;
  // Few years need less width to read; the full range keeps the old 640 minimum.
  const Wd = Math.max(W, Math.min(640, left + years.length * 10));
  const cw = (Wd - left) / years.length;
  const x = (y: number) => left + (y - years[0]) * cw;
  const step = TICK_STEPS.find((n) => n * cw >= LABEL_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks = years.filter((y) => y % step === 0);
  const H = top + rowH * leagues.length + 4;
  return (
    <div className="yr-hold">
      <YearRange min={y0} max={y1} from={span.from} to={span.to} onChange={onRange} />
      <div className="chart scroll" ref={ref}>
        <svg viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label={say("heatmap.aria")}>
          <g>{ticks.map((y) => <text key={y} x={x(y)} y={11}>{y}</text>)}</g>
          <g>{ticks.map((y) => <line key={y} x1={x(y)} x2={x(y)} y1={top - 3} y2={top + rowH * leagues.length} stroke="var(--rule)" />)}</g>
          {leagues.map((lg, i) => (
            <g key={lg} transform={`translate(0,${top + i * rowH})`} style={{ "--accent-cell": `var(--${lg})` } as React.CSSProperties}>
              <text className="lab" x={0} y={rowH / 2 + 5}>{LG[lg as keyof typeof LG]}</text>
              {years.map((yr) => {
                const s = byLeague.get(lg)?.get(yr);
                if (!s) return null;
                return (
                  <rect key={yr} x={x(yr) + 0.5} y={3} width={Math.max(1, cw - 1)} height={rowH - 6}
                    fill={s.games === 0 && !s.champion ? "var(--soft)" : shareColor(s.share)} stroke={s.share > 0 ? "none" : "var(--rule)"} strokeWidth={0.5} style={{ cursor: "pointer" }}
                    onClick={() => router.push(seasonPath(lg, s.year))}
                    onMouseMove={(ev) => tip.show(ev, <TipLines title={`${LG[lg as keyof typeof LG]} ${s.label}`} lines={[
                      s.games ? say("heatmap.share", { finals: fmt(s.finals), games: fmt(s.games) }) : s.champion ? say("noseason.awards") : say("noseason.league"),
                      s.champion ? say("tip.champion", { team: s.champion }) : null]} />)}
                    onMouseLeave={tip.hide} />
                );
              })}
            </g>
          ))}
        </svg>
        {tip.element}
      </div>
    </div>
  );
}
