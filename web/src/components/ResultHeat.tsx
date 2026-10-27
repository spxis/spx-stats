"use client";

import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { atUtc } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { seasonLabel, topLeague } from "@/lib/leagues";
import {
  HEAT_ROWS, buildHeat, clipHeatGames, heatHover, heatPack, heatRecord, heatSeasons,
  type GameTone, type HeatCell, type HeatGame,
} from "@/lib/resultHeat";
import { useHeatCard } from "./HeatCard";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./resultHeat.css";

const LEFT = 4;
const TOP = 16;

function hrefOf(lg: string, g: HeatGame): string {
  return gamePath(lg, g.year, g.id, g.awayName, g.homeName);
}

function toneClass(tone: GameTone): string {
  return tone === "W" || tone === "L" || tone === "T" || tone === "OTL" ? tone : "pending";
}

export interface ResultHeatProps {
  lg: string;
  games: readonly HeatGame[];
  /** Smaller record type (compare columns). */
  compact?: boolean;
  /** Hide the season slider and keep every game (the all-time pane beside a season grid). */
  lock?: "all";
  /**
   * Grow squares toward the container. Off for the season pane of Option B (11px cells). On for compare and
   * all-time so the graph uses its column width.
   */
  fill?: boolean;
}

/**
 * A GitHub-sized graph of one club's results: one square per game, no empty days. A slider above picks one season
 * or every game (all-time still one graph, not a year stack). Colour is W / L / T / OTL.
 */
export function ResultHeat({ lg, games, compact = false, lock, fill = true }: ResultHeatProps) {
  const { say, dt } = useSpeaker();
  const router = useRouter();
  const [box, width] = useChartWidth(compact ? 340 : 640, 120);
  const card = useHeatCard();
  const touched = useRef(false);
  const seasons = useMemo(() => heatSeasons(games), [games]);
  const [pick, setPick] = useState<number | "all">("all");
  const year: number | "all" = lock === "all"
    ? "all"
    : pick !== "all" && seasons.includes(pick) ? pick : seasons.length === 1 ? seasons[0]! : "all";
  const shown = useMemo(() => (year === "all" ? games : clipHeatGames(games, year, year)), [games, year]);
  const inner = Math.max(40, width - LEFT);
  const seasonGrid = year !== "all" || seasons.length <= 1;
  const pack = useMemo(() => {
    if (seasonGrid && !fill) return heatPack(shown.length, { rows: HEAT_ROWS, compact });
    return heatPack(shown.length, seasonGrid
      ? { width: inner, rows: HEAT_ROWS, fill: true, compact }
      : { width: inner, compact });
  }, [shown.length, inner, seasonGrid, compact, fill]);
  const grid = useMemo(() => buildHeat(shown, pack.rows), [shown, pack.rows]);
  const showSlider = lock !== "all" && seasons.length > 1;
  if (!grid) return <p className="note">{say("rheat.empty")}</p>;

  const has = (t: GameTone) => grid.columns.some((col) => col.some((c) => c?.tone === t));
  const legend: { tone: GameTone; key: "result.win" | "result.loss" | "result.tie" | "result.lostOt" | "rheat.legend.pending" }[] = [
    { tone: "W", key: "result.win" },
    { tone: "L", key: "result.loss" },
    ...(has("T") ? [{ tone: "T" as const, key: "result.tie" as const }] : []),
    ...(has("OTL") ? [{ tone: "OTL" as const, key: "result.lostOt" as const }] : []),
    ...(has("pending") ? [{ tone: "pending" as const, key: "rheat.legend.pending" as const }] : []),
  ];

  const cardOf = (c: HeatCell): { title: string; lines: string[] } => {
    const h = heatHover(c.game);
    const title = dt.full(atUtc(h.date));
    const res = h.res ? say(RESULT_KEY[h.res]) : say("rheat.legend.pending");
    const score = h.score ? `${h.score}${h.ot ? ` ${say(topLeague(lg) === "mlb" ? "game.extras" : "game.ot")}` : ""}` : "·";
    const opp = h.opp || "—";
    return { title, lines: [say(h.home ? "rheat.card.vs" : "rheat.card.at", { opp }), score, res] };
  };

  const bodyOf = (c: HeatCell): ReactNode => {
    const { title, lines } = cardOf(c);
    return <TipLines title={title} lines={lines} />;
  };

  const open = (c: HeatCell) => { router.push(hrefOf(lg, c.game)); };
  const onKey = (ev: KeyboardEvent<SVGRectElement>, c: HeatCell) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(c); }
    else if (ev.key === "Escape") card.hide();
  };
  const onPointerDown = (ev: PointerEvent<SVGRectElement>) => { touched.current = ev.pointerType === "touch"; };
  const onEnter = (ev: PointerEvent<SVGRectElement>, c: HeatCell) => {
    if (ev.pointerType !== "touch") card.show(ev.currentTarget, bodyOf(c));
  };
  const onLeave = (ev: PointerEvent<SVGRectElement>) => {
    if (ev.pointerType !== "touch") card.hide();
  };
  const onFocus = (ev: FocusEvent<SVGRectElement>, c: HeatCell) => {
    if (ev.currentTarget.matches(":focus-visible")) card.show(ev.currentTarget, bodyOf(c));
  };
  const onBlur = (ev: FocusEvent<SVGRectElement>) => {
    if (card.shownOn() === ev.currentTarget) card.hide();
  };
  const onClick = (ev: MouseEvent<SVGRectElement>, c: HeatCell) => {
    if (touched.current && card.shownOn() !== ev.currentTarget) {
      ev.preventDefault();
      card.show(ev.currentTarget, bodyOf(c));
      return;
    }
    open(c);
  };

  const cell = pack.cell;
  const gap = pack.gap;
  const step = cell + gap;
  const label = year === "all" ? say("rheat.all") : seasonLabel(lg, year);
  const marks = year === "all" && seasons.length > 1 ? sparseMarks(grid.marks, Math.max(compact ? 6 : 4, Math.ceil(36 / step))) : [];
  const W = LEFT + grid.cols * step;
  const H = TOP + (grid.rows - 1) * step + cell;
  const aria = say("rheat.aria", { n: String(grid.games), label });
  const focusable = grid.games <= 200;

  return (
    <div className={`rheat${compact ? " compact" : ""}`} ref={box}>
      {showSlider ? (
        <HeatSeasonSlider lg={lg} seasons={seasons} value={year} onChange={setPick} />
      ) : null}
      <div className="rheat-head">
        <span className="rheat-rec">{heatRecord(grid.tally)}</span>
        <span className="rheat-span">{label} · {say("rheat.span", { from: dt.ymd(atUtc(grid.first)), to: dt.ymd(atUtc(grid.last)) })}</span>
      </div>
      <div className="rheat-legend" aria-hidden="true">
        {legend.map((x) => <span key={x.key}><i className={`sq ${toneClass(x.tone)}`} /><span>{say(x.key)}</span></span>)}
      </div>
      <div className="rheat-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={aria} data-games={grid.games} data-rows={grid.rows} data-cell={cell}>
          {marks.map((m) => (
            <text key={`m${m.col}`} className="lab" x={LEFT + m.col * step} y={10}>{seasonLabel(lg, m.year)}</text>
          ))}
          {grid.columns.map((col, i) => col.map((c, r) => {
            if (!c) return null;
            const facts = cardOf(c);
            return (
              <rect key={c.game.id} className={`sq ${toneClass(c.tone)} link`} x={LEFT + i * step} y={TOP + r * step}
                width={cell} height={cell} role="link" tabIndex={focusable ? 0 : undefined}
                data-heat={String(c.game.id)}
                aria-label={[facts.title, ...facts.lines].join(". ")}
                onClick={(ev) => onClick(ev, c)}
                onKeyDown={focusable ? (ev) => onKey(ev, c) : undefined}
                onPointerDown={onPointerDown}
                onPointerEnter={(ev) => onEnter(ev, c)} onPointerLeave={onLeave}
                onFocus={focusable ? (ev) => onFocus(ev, c) : undefined}
                onBlur={focusable ? onBlur : undefined} />
            );
          }))}
        </svg>
      </div>
      {card.element}
    </div>
  );
}

function sparseMarks(marks: { col: number; year: number }[], minGap: number) {
  const out: { col: number; year: number }[] = [];
  for (const m of marks) {
    if (!out.length || m.col - out[out.length - 1]!.col >= minGap) out.push(m);
  }
  return out;
}

function HeatSeasonSlider({ lg, seasons, value, onChange }: {
  lg: string; seasons: readonly number[]; value: number | "all"; onChange: (v: number | "all") => void;
}) {
  const { say } = useSpeaker();
  const idx = value === "all" ? 0 : seasons.indexOf(value) + 1;
  const label = value === "all" ? say("rheat.all") : seasonLabel(lg, value);
  return (
    <div className="rheat-slider" role="group" aria-label={say("rheat.slider")}>
      <button type="button" className="rheat-all" aria-pressed={value === "all"} onClick={() => onChange("all")}>{say("rheat.all")}</button>
      <label className="rheat-range">
        <input type="range" min={0} max={seasons.length} value={idx} step={1}
          aria-label={say("rheat.slider")} aria-valuetext={label}
          onChange={(e) => {
            const i = Number(e.target.value);
            onChange(i === 0 ? "all" : seasons[i - 1]!);
          }} />
      </label>
      <span className="rheat-pick" aria-live="polite">{label}</span>
    </div>
  );
}
