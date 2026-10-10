"use client";

import { curveStepAfter, line, max, scaleBand, scaleLinear } from "d3";
import { useId } from "react";
import { fill } from "@/lib/i18n/i18n";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

export interface ChartGame {
  n: number;
  date: string;
  /** What side 0 and side 1 scored; null with no result. */
  score: [number | null, number | null];
  winner: 0 | 1 | null;
  ot: boolean;
  /** Wins of each side after the game. */
  run: [number, number];
}

interface Props {
  games: ChartGame[];
  /** Nicknames of side 0 and side 1. */
  names: [string, string];
  /** What is scored, as the reader's language says it: Goals, Runs, Points. */
  unit: string;
  /** The chart words, with their {placeholders}, from lib/seriesCopy (a client component cannot call the speaker). */
  words: ChartWords;
}

export interface ChartWords {
  perGame: string; margin: string; soFar: string; won: string;
  ariaScored: string; ariaMargin: string; ariaTotal: string; ariaWon: string;
  none: string; tipGame: string; tipGameOt: string; tied: string; by: string; after: string;
}

const COLOR = ["var(--ca)", "var(--cb)"] as const;
const H = 230, M = { t: 16, r: 14, b: 30, l: 38 };

/** Axis, grid and the plot's scales shared by the bar charts. */
function barScales(games: ChartGame[], W: number) {
  const x = scaleBand<number>(games.map((g) => g.n), [M.l, W - M.r]).padding(0.22);
  const step = Math.ceil(games.length / Math.max(1, Math.floor((W - M.l) / 30)));
  return { x, step };
}

function Ticks({ games, x, step, W, y, fmtY, yTicks }: { games: ChartGame[]; x: ReturnType<typeof scaleBand<number>>; step: number; W: number; y: (v: number) => number; fmtY?: (v: number) => string; yTicks: number[] }) {
  return (
    <>
      <g>{yTicks.map((t) => <line key={t} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
      <g>{yTicks.map((t) => <text key={t} x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmtY ? fmtY(t) : t}</text>)}</g>
      <g>{games.filter((_, i) => i % step === 0).map((g) => (
        <text key={g.n} x={(x(g.n) ?? 0) + x.bandwidth() / 2} y={H - 8} textAnchor="middle">{g.n}</text>
      ))}</g>
    </>
  );
}

function Empty({ box, words }: { box: React.RefObject<HTMLDivElement | null>; words: ChartWords }) {
  return <div className="chart" ref={box}><p className="note">{words.none}</p></div>;
}

/** What each team scored in each game, side by side. */
export function ScoredBars({ games, names, unit, words }: Props) {
  const [ref, W] = useChartWidth(300, 260);
  const tip = useTooltip(ref);
  const played = games.filter((g) => g.score[0] != null);
  if (!played.length) return <Empty box={ref} words={words} />;
  const { x, step } = barScales(played, W);
  const top = max(played, (g) => Math.max(g.score[0] ?? 0, g.score[1] ?? 0)) || 1;
  const y = scaleLinear([0, top], [H - M.b, M.t]).nice();
  const yTicks = y.ticks(4).filter(Number.isInteger);
  const inner = x.bandwidth() / 2;
  const labels = inner >= 16;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={fill(words.ariaScored, { unit })}>
        <Ticks games={played} x={x} step={step} W={W} y={y} yTicks={yTicks} />
        {played.map((g, gi) => (
          <g key={g.n} onMouseMove={(ev) => tip.show(ev, <TipLines title={fill(g.ot ? words.tipGameOt : words.tipGame, { n: g.n })} lines={[`${names[0]} ${g.score[0]}`, `${names[1]} ${g.score[1]}`]} />)} onMouseLeave={tip.hide}>
            <rect x={x(g.n)} y={0} width={x.bandwidth()} height={H - M.b} fill="transparent" />
            {([0, 1] as const).map((i) => {
              const v = g.score[i] ?? 0;
              return (
                <g key={i}>
                  <rect className="bar-grow" x={(x(g.n) ?? 0) + i * inner} width={inner} y={y(v)} height={y(0) - y(v)} fill={COLOR[i]} opacity={g.winner === i || g.winner == null ? 1 : 0.55}
                    style={{ transformOrigin: `0px ${y(0)}px`, animationDelay: `${Math.min(gi * 25, 300)}ms` }} />
                  {labels ? <text x={(x(g.n) ?? 0) + i * inner + inner / 2} y={y(v) - 4} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 11 }}>{v}</text> : null}
                </g>
              );
            })}
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} stroke="var(--ink)" />
      </svg>
      {tip.element}
    </div>
  );
}

/** The margin of each game from the first team's side: up when it won, down when the other did. */
export function MarginSeries({ games, names, words }: Props) {
  const [ref, W] = useChartWidth(300, 260);
  const tip = useTooltip(ref);
  const played = games.filter((g) => g.score[0] != null);
  if (!played.length) return <Empty box={ref} words={words} />;
  const { x, step } = barScales(played, W);
  const ext = max(played, (g) => Math.abs((g.score[0] ?? 0) - (g.score[1] ?? 0))) || 1;
  const y = scaleLinear([-ext, ext], [H - M.b, M.t]).nice();
  const yTicks = y.ticks(4).filter(Number.isInteger);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={words.ariaMargin}>
        <Ticks games={played} x={x} step={step} W={W} y={y} yTicks={yTicks} fmtY={(t) => String(Math.abs(t))} />
        {played.map((g, gi) => {
          const d = (g.score[0] ?? 0) - (g.score[1] ?? 0);
          const w = g.winner;
          return (
            <g key={g.n} onMouseMove={(ev) => tip.show(ev, <TipLines title={fill(g.ot ? words.tipGameOt : words.tipGame, { n: g.n })} lines={[`${names[0]} ${g.score[0]}, ${names[1]} ${g.score[1]}`, d === 0 ? words.tied : fill(words.by, { team: names[d > 0 ? 0 : 1], n: Math.abs(d) })]} />)} onMouseLeave={tip.hide}>
              <rect x={x(g.n)} y={0} width={x.bandwidth()} height={H - M.b} fill="transparent" />
              <rect className="bar-grow" x={x(g.n)} width={x.bandwidth()} y={Math.min(y(d), y(0))} height={Math.max(Math.abs(y(d) - y(0)), d === 0 ? 2 : 0)} fill={w == null ? "var(--muted)" : COLOR[w]}
                style={{ transformOrigin: `0px ${y(0)}px`, animationDelay: `${Math.min(gi * 25, 300)}ms` }} />
            </g>
          );
        })}
        <line className="zero" x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} />
        <text x={M.l + 4} y={M.t - 4} style={{ fill: COLOR[0], fontWeight: 600 }}>{`↑ ${names[0]}`}</text>
        <text x={M.l + 4} y={H - M.b - 6} style={{ fill: COLOR[1], fontWeight: 600 }}>{`↓ ${names[1]}`}</text>
      </svg>
      {tip.element}
    </div>
  );
}

/** A running total after each game, one stepped line per team: what they scored, or the games they have won. */
export function RunningTotals({ games, names, label, pick, words }: Props & { label: string; pick: (g: ChartGame) => [number, number] }) {
  const [ref, W] = useChartWidth(300, 260);
  const tip = useTooltip(ref);
  const id = useId();
  const played = games.filter((g) => g.score[0] != null);
  if (played.length < 2) return <Empty box={ref} words={words} />;
  // Points are [game 0 (nothing yet), after game 1, ...].
  const pts = [{ n: 0, v: [0, 0] as [number, number] }, ...played.map((g) => ({ n: g.n, v: pick(g) }))];
  const x = scaleLinear([0, played[played.length - 1].n], [M.l, W - M.r - 6]);
  const top = max(pts, (p) => Math.max(p.v[0], p.v[1])) || 1;
  const y = scaleLinear([0, top], [H - M.b, M.t]).nice();
  const yTicks = y.ticks(4).filter(Number.isInteger);
  const path = (i: 0 | 1) => line<{ n: number; v: [number, number] }>().x((p) => x(p.n)).y((p) => y(p.v[i])).curve(curveStepAfter)(pts) ?? undefined;
  const last = pts[pts.length - 1];
  const step = Math.ceil(played.length / Math.max(1, Math.floor((W - M.l) / 30)));
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <g>{yTicks.map((t) => <line key={t} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{yTicks.map((t) => <text key={t} x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>)}</g>
        <g>{played.filter((_, i) => i % step === 0).map((g) => <text key={g.n} x={x(g.n)} y={H - 8} textAnchor="middle">{g.n}</text>)}</g>
        {([0, 1] as const).map((i) => (
          <g key={`${id}${i}`}>
            <path className="line-draw" pathLength={1} d={path(i)} fill="none" stroke={COLOR[i]} strokeWidth={2.5} strokeLinejoin="round" />
            {pts.slice(1).map((p) => <circle key={p.n} cx={x(p.n)} cy={y(p.v[i])} r={3} fill={COLOR[i]} stroke="var(--paper)" strokeWidth={1} />)}
            <text x={x(last.n) + 4} y={y(last.v[i]) + (last.v[0] === last.v[1] ? (i === 0 ? -6 : 12) : 4)} style={{ fill: COLOR[i], fontWeight: 700, fontSize: 13 }}>{last.v[i]}</text>
          </g>
        ))}
        {played.map((g) => (
          <rect key={g.n} x={x(g.n) - (W - M.l - M.r) / played.length / 2} y={0} width={(W - M.l - M.r) / played.length} height={H - M.b} fill="transparent"
            onMouseMove={(ev) => { const v = pick(g); tip.show(ev, <TipLines title={fill(words.after, { n: g.n })} lines={[`${names[0]} ${v[0]}`, `${names[1]} ${v[1]}`]} />); }} onMouseLeave={tip.hide} />
        ))}
      </svg>
      {tip.element}
    </div>
  );
}

/** The four charts of a series, each under its heading. A one-game series draws only the two that make sense. */
export function SeriesCharts({ games, names, unit, words }: Props) {
  const total = (() => {
    const t: [number, number][] = [];
    let a = 0, b = 0;
    for (const g of games) { a += g.score[0] ?? 0; b += g.score[1] ?? 0; t.push([a, b]); }
    return new Map(games.map((g, i) => [g.n, t[i]]));
  })();
  const several = games.filter((g) => g.score[0] != null).length > 1;
  return (
    <>
      <div className="legend serlegend">
        <span><i style={{ background: COLOR[0] }} />{names[0]}</span>
        <span><i style={{ background: COLOR[1] }} />{names[1]}</span>
      </div>
      <div className="serchart">
        <div><h3>{fill(words.perGame, { unit })}</h3><ScoredBars games={games} names={names} unit={unit} words={words} /></div>
        <div><h3>{words.margin}</h3><MarginSeries games={games} names={names} unit={unit} words={words} /></div>
        {several ? (
          <>
            <div><h3>{fill(words.soFar, { unit })}</h3><RunningTotals games={games} names={names} unit={unit} words={words} label={fill(words.ariaTotal, { unit: unit.toLowerCase() })} pick={(g) => total.get(g.n) ?? [0, 0]} /></div>
            <div><h3>{words.won}</h3><RunningTotals games={games} names={names} unit={unit} words={words} label={words.ariaWon} pick={(g) => g.run} /></div>
          </>
        ) : null}
      </div>
    </>
  );
}
