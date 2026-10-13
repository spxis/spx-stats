"use client";

import { line, max, scaleBand, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { leagueAvg, perOf, rankIn, refKey, type GroupView, type Metric, type SeasonTotal } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { seasonLabel } from "@/lib/leagues";
import { showStat } from "@/lib/playerStats";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import { TeamLogo } from "./TeamLogo";
import { useChartWidth } from "./useChartWidth";
import { usePointCard } from "./usePointCard";
import type { BoardView } from "./playerView";

/** An innings figure is held as outs; a chart draws it as innings. */
const drawn = (m: Metric, v: number | null) => (v == null ? null : m.kind === "ip" ? v / 3 : v);

const H = 250;

/** Bars of the chosen stat for each season of the range (a club's share in its colour when the player had several that year), a line for the per-game
    figure and the league's average for context, ◆ under a season the player reached the playoffs in and ★ under a title. A bar opens that club's season. */
export function PlayerBars({ view, g, metric }: { view: BoardView; g: GroupView; metric: Metric }) {
  const { say, fmt, plural } = useSpeaker();
  const router = useRouter();
  const paths = usePaths();
  const [ref, W] = useChartWidth(640, 300);
  const phase = view.state.phase, span = view.state.span;
  const { clubs, titles, seasons } = view.data;
  const years = useMemo(() => Array.from({ length: span.to - span.from + 1 }, (_, i) => span.from + i), [span]);
  const by = useMemo(() => new Map(g.seasons.map((s) => [s.year, s])), [g.seasons]);
  const hasPer = metric.sum && !!metric.per;
  const avgRef = metric.ref;

  const bars = years.map((year) => {
    const s = by.get(year);
    const total = s ? metric.get(s.stats) : null;
    const per = s && hasPer ? perOf(metric, s.stats) : !metric.sum && s ? metric.get(s.stats) : null;
    const avg = leagueAvg(view.refs, g.def.id, phase, avgRef, year);
    return { year, s, total, per, avg };
  });
  const secondary = hasPer;
  const m = { t: 14, r: secondary ? 40 : 8, b: 40, l: 40 };
  const x = scaleBand<number>(years, [m.l, W - m.r]).paddingInner(0.16);
  const y = scaleLinear([0, Math.max(max(bars, (b) => drawn(metric, b.total) ?? 0) ?? 0, metric.sum ? 1 : 0.0001)], [H - m.b, m.t]).nice();
  const perTop = max(bars, (b) => Math.max(b.per ?? 0, b.avg ?? 0)) ?? 0;
  const y2 = scaleLinear([0, Math.max(perTop, 0.0001)], [H - m.b, m.t]).nice();
  // For a rate (AVG, ERA ...) the bars and the league's average share one scale; for a count the per-game figures have their own, on the right.
  const yLine = secondary ? y2 : y;
  const mid = (year: number) => (x(year) ?? 0) + x.bandwidth() / 2;
  const every = Math.max(1, Math.ceil(years.length / Math.max(2, Math.floor((W - m.l - m.r) / 52))));

  const mark = line<{ year: number; v: number | null }>().defined((d) => d.v != null).x((d) => mid(d.year)).y((d) => yLine(d.v ?? 0));
  const perPath = mark(bars.map((b) => ({ year: b.year, v: hasPer ? b.per : null })));
  const avgPath = mark(bars.map((b) => ({ year: b.year, v: b.avg })));

  const keys = bars.filter((b) => b.s).map((b) => String(b.year));
  const clubOf = (p: { league: string; f: number; year: number }) => clubs[`${p.league}|${p.f}|${p.year}`];
  const lead = (s: SeasonTotal) => [...s.parts].sort((a, b) => (g.def.games(b.stats) ?? 0) - (g.def.games(a.stats) ?? 0))[0];
  const open = (key: string) => {
    const s = by.get(Number(key));
    if (!s) return;
    const p = lead(s);
    router.push(paths.teamSeason(p.league, p.f, p.year));
  };
  const card = usePointCard(keys, open);
  const titleYears = new Set(titles.filter((t) => t.league === g.league).map((t) => t.year));
  for (const s of seasons) if (s.league === g.league && s.champ) titleYears.add(s.year);
  const playoffYears = new Set(seasons.filter((s) => s.league === g.league && s.po).map((s) => s.year));

  const label = (year: number) => seasonLabel(g.league, year);
  const body = (b: (typeof bars)[number]) => {
    const s = b.s!;
    const rank = metric.sum ? rankIn(view.refs.get(refKey(g.def.id, phase, metric.id, b.year))?.t, b.total) : null;
    return (
      <>
        <b>{label(b.year)}{phase === "playoffs" ? ` · ${say("phase.playoffs")}` : ""}</b>
        {s.parts.map((p) => (
          <div key={p.ts} className="tipclub"><TeamLogo url={clubOf(p)?.logo} size={14} />{p.team ?? say("team.fallback", { id: p.f })}{s.parts.length > 1 ? ` · ${fmt(metric.get(p.stats) ?? 0)}` : ""}</div>
        ))}
        <div>{say(metric.title as PhraseKey)}: <b className="tipv">{showStat(metric.kind, b.total, fmt)}</b>{g.def.games(s.stats) != null ? ` · ${plural("board.gamesIn", g.def.games(s.stats) ?? 0)}` : ""}</div>
        {hasPer && b.per != null ? <div>{say(metric.per!.unit === "nine" ? "hero.perNine" : "hero.perGame", { n: b.per.toFixed(2) })}</div> : null}
        {b.avg != null ? <div>{say("bars.leagueAvg", { n: metric.kind === "rate3" ? showStat("rate3", b.avg, fmt) : b.avg.toFixed(2) })}</div> : null}
        {rank != null ? <div>{say("bars.rank", { rank: fmt(rank) })}</div> : null}
        {titleYears.has(b.year) ? <div>{say("bars.title")}</div> : playoffYears.has(b.year) && phase === "regular" ? <div>{say("bars.playoffs")}</div> : null}
        <div className="tiphint">{say("bars.open")}</div>
      </>
    );
  };
  const summary = (b: (typeof bars)[number]) => `${label(b.year)}: ${showStat(metric.kind, b.total, fmt)} ${say(metric.label as PhraseKey)}`;
  const legendClubs = useMemo(() => {
    const seen = new Map<string, { tone: string; logo: string | null; name: string }>();
    for (const s of g.seasons) for (const p of s.parts) {
      const c = clubs[`${p.league}|${p.f}|${p.year}`];
      seen.set(`${p.league}:${p.f}`, { tone: c?.tone ?? "var(--muted)", logo: c?.logo ?? null, name: p.team ?? say("team.fallback", { id: p.f }) });
    }
    return [...seen.values()];
  }, [g.seasons, clubs, say]);

  return (
    <div className="pchart">
      <h3>{say("charts.bars")}</h3>
      <p className="note">{say("charts.barsNote", { stat: say(metric.title as PhraseKey) })}</p>
      <div className="chart" ref={ref} data-marks>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={say("player.chartAria", { stat: say(metric.title as PhraseKey) })}>
          <g>{y.ticks(4).map((t) => (
            <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{metric.kind === "rate3" ? showStat("rate3", t, fmt) : fmt(t)}</text></g>
          ))}</g>
          {secondary ? <g>{y2.ticks(4).map((t) => <text key={t} x={W - m.r + 6} y={y2(t)} dy="0.32em">{Number.isInteger(t) ? fmt(t) : t.toFixed(1)}</text>)}</g> : null}
          <g>{bars.map((b) => {
            const s = b.s;
            if (!s || b.total == null) return null;
            const key = String(b.year);
            const stacked = metric.sum ? s.parts : [lead(s)];
            let base = y(0);
            const bw = x.bandwidth(), bx = x(b.year) ?? 0;
            const segs = stacked.map((p) => {
              const v = drawn(metric, metric.sum ? (metric.get(p.stats) ?? 0) : b.total) ?? 0;
              const h = metric.sum ? Math.max(0, y(0) - y(v)) : Math.max(0, y(0) - y(drawn(metric, b.total) ?? 0));
              base -= h;
              return { p, y: base, h };
            });
            return (
              <g key={key} className="mark" role="link" aria-label={summary(b)} {...card.bind(key, () => body(b))}>
                <rect className="hit" x={bx - x.step() * x.paddingInner() / 2} width={x.step()} y={m.t} height={H - m.b - m.t} />
                {segs.map((sg) => <rect key={sg.p.ts} className="bar" x={bx} width={bw} y={sg.y} height={sg.h} rx={1.5} style={{ fill: clubOf(sg.p)?.tone ?? "var(--accent)" }} />)}
              </g>
            );
          })}</g>
          {avgPath ? <path className="avgline" d={avgPath} /> : null}
          {perPath ? <path className="perline" d={perPath} /> : null}
          {hasPer ? <g>{bars.map((b) => b.per == null ? null : <circle key={b.year} className="perdot" cx={mid(b.year)} cy={yLine(b.per)} r={2.5} />)}</g> : null}
          <g>{years.map((yr, i) => i % every ? null : <text key={yr} x={mid(yr)} y={H - m.b + 15} textAnchor="middle">{label(yr)}</text>)}</g>
          <g aria-hidden="true">{years.map((yr) => (
            titleYears.has(yr) ? <text key={yr} className="glyph star" x={mid(yr)} y={H - 8} textAnchor="middle">★</text>
              : phase === "regular" && playoffYears.has(yr) ? <text key={yr} className="glyph dia" x={mid(yr)} y={H - 8} textAnchor="middle">◆</text> : null
          ))}</g>
        </svg>
        {card.element}
      </div>
      <div className="legend plegend">
        {legendClubs.map((c) => <span key={c.name}><i style={{ background: c.tone }} />{c.logo ? <TeamLogo url={c.logo} size={14} /> : null}{c.name}</span>)}
        {hasPer ? <span><i className="key-per" />{say(metric.per!.unit === "nine" ? "bars.keyPerNine" : "bars.keyPer")}</span> : null}
        {view.refs.size && avgRef ? <span><i className="key-avg" />{say("bars.keyAvg")}</span> : null}
        <span><b className="glyph star">★</b> {say("bars.keyTitle")}</span>
        {phase === "regular" ? <span><b className="glyph dia">◆</b> {say("bars.keyPlayoffs")}</span> : null}
      </div>
      <p className="visually-hidden">{plural("board.seasonsIn", keys.length)}</p>
    </div>
  );
}
