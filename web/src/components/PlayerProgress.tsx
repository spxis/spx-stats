"use client";

import { area, extent, line, scaleLinear } from "d3";
import { useMemo } from "react";
import { awardBadge, bySeason, cumulative, metricOf, milestonesOf, peakSeason, type GroupView, type Metric } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { seasonLabel } from "@/lib/leagues";
import { showStat } from "@/lib/playerStats";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TeamLogo } from "./TeamLogo";
import { useChartWidth } from "./useChartWidth";
import { usePointCard } from "./usePointCard";
import type { BoardView } from "./playerView";

const H = 270;

/**
 * The career line: the running total of a counting stat, season by season, over the seasons chosen but counted from the first game (so 500 goals
 * is the career's 500th, wherever the range starts). Milestones (500 goals, 1,000 points, 3,000 hits ...) stand on the line where they were reached,
 * the best season is ringed, and titles and awards sit on the timeline under it.
 */
export function PlayerProgress({ view, g, metric: picked }: { view: BoardView; g: GroupView; metric: Metric }) {
  const { say, fmt, plural } = useSpeaker();
  const [ref, W] = useChartWidth(640, 300);
  // A rate (average, ERA) has no running total: the line then follows the group's headline count.
  const metric = picked.sum ? picked : metricOf(g.def, g.def.main);
  const { span } = view.state;
  const all = useMemo(() => cumulative(bySeason(g.all), metric.get), [g.all, metric]);
  const baseline = useMemo(() => all.filter((p) => p.year < span.from).at(-1)?.value ?? 0, [all, span.from]);
  const shown = all.filter((p) => p.year >= span.from && p.year <= span.to);
  const marks = g.def.milestones.find((x) => x.id === metric.id)?.marks ?? [];
  const reached = milestonesOf(all, marks).filter((x) => x.year >= span.from && x.year <= span.to);
  const peak = peakSeason(shown.map((p) => ({ year: p.year, v: p.added })));
  const { clubs, titles, awards } = view.data;
  const label = (year: number) => seasonLabel(g.league, year);
  const num = (v: number) => (metric.kind === "ip" ? showStat("ip", v, fmt) : fmt(v));

  const domain = extent(shown, (p) => p.year) as [number, number];
  const m = { t: 34, r: 14, b: 66, l: 46 };
  const x = scaleLinear(span.from === span.to ? [span.from - 0.5, span.to + 0.5] : [span.from, span.to], [m.l, W - m.r]);
  const top = shown.at(-1)?.value ?? baseline;
  const y = scaleLinear([baseline, Math.max(top, baseline + 1)], [H - m.b, m.t]).nice();
  const path = line<{ year: number; value: number }>().x((d) => x(d.year)).y((d) => y(d.value));
  const fill = area<{ year: number; value: number }>().x((d) => x(d.year)).y0(H - m.b).y1((d) => y(d.value));
  const pts = [{ year: span.from, value: baseline }, ...shown];
  const evTitles = titles.filter((t) => t.league === g.league && t.year >= span.from && t.year <= span.to);
  const evAwards = awards.filter((a) => a.league === g.league && a.year >= span.from && a.year <= span.to);
  const awardsBy = new Map<number, string[]>();
  for (const a of evAwards) awardsBy.set(a.year, [...(awardsBy.get(a.year) ?? []), a.award]);

  const keys = [...shown.map((p) => `s${p.year}`), ...reached.map((r) => `m${r.mark}`), ...evTitles.map((t) => `t${t.year}`), ...[...awardsBy.keys()].map((yr) => `a${yr}`)];
  const card = usePointCard(keys);
  const clubAt = (year: number) => { const s = by(year); return s ? clubs[`${s.league}|${s.parts[0].f}|${s.year}`] : undefined; };
  const seasonsByYear = useMemo(() => new Map(bySeason(g.all).map((s) => [s.year, s])), [g.all]);
  function by(year: number) { return seasonsByYear.get(year); }

  const lbl = say(metric.label as PhraseKey);
  // Hidden, not left out, while the range holds no season: the box stays in the page so its width is kept current.
  return (
    <div className="pchart" hidden={!shown.length}>
      <h3>{say("charts.progress", { stat: say(metric.title as PhraseKey) })}</h3>
      <p className="note">{picked.sum ? say("charts.progressNote") : say("charts.progressRate", { stat: say(metric.title as PhraseKey) })}</p>
      <div className="chart" ref={ref} data-marks>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={say("charts.progressAria", { stat: say(metric.title as PhraseKey) })}>
          <g>{y.ticks(4).map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{num(t)}</text></g>)}</g>
          <path className="careerfill" d={fill(pts) ?? undefined} />
          <path className="careerline" d={path(pts) ?? undefined} />
          {baseline > 0 ? <text className="carried" x={m.l + 4} y={y(baseline) - 6}>{say("charts.carried", { n: num(baseline), stat: lbl })}</text> : null}
          <g>{shown.map((p) => {
            const club = clubAt(p.year);
            const key = `s${p.year}`;
            return (
              <g key={key} role="img" aria-label={`${label(p.year)}: ${num(p.value)} ${lbl} (+${num(p.added)})`} {...card.bind(key, () => (
                <>
                  <b>{label(p.year)}</b>
                  {club ? <div className="tipclub"><TeamLogo url={club.logo} size={14} />{club.team}</div> : null}
                  <div>{say("charts.totalTip", { n: num(p.value), stat: lbl })}</div>
                  <div>{say("charts.added", { n: num(p.added), stat: lbl })}</div>
                  {peak === p.year ? <div>{say("charts.peak")}</div> : null}
                </>
              ))}>
                <circle className="hitdot" cx={x(p.year)} cy={y(p.value)} r={11} />
                <circle className="careerdot" cx={x(p.year)} cy={y(p.value)} r={peak === p.year ? 5 : 3} />
              </g>
            );
          })}</g>
          {peak != null && shown.some((p) => p.year === peak) ? (
            <g aria-hidden="true">
              <circle className="peakring" cx={x(peak)} cy={y(shown.find((p) => p.year === peak)!.value)} r={9} />
            </g>
          ) : null}
          <g>{reached.map((r, i) => {
            const key = `m${r.mark}`;
            const px = x(r.year), py = y(shown.find((p) => p.year === r.year)?.value ?? r.value);
            const up = 14 + (i % 2) * 14;
            return (
              <g key={key} role="img" aria-label={say("charts.milestoneAria", { mark: num(r.mark), stat: lbl, season: label(r.year) })} {...card.bind(key, () => (
                <>
                  <b>{num(r.mark)} {lbl}</b>
                  <div>{say("charts.reached", { season: label(r.year), n: num(r.value) })}</div>
                </>
              ))}>
                <line className="mstem" x1={px} x2={px} y1={py - 5} y2={m.t - 12 + up - 14} />
                <circle className="mdot" cx={px} cy={py} r={5.5} />
                <text className="mlabel" x={Math.min(Math.max(px, m.l + 18), W - m.r - 18)} y={m.t - 14 + up - 14} textAnchor="middle">{num(r.mark)} {lbl}</text>
              </g>
            );
          })}</g>
          <g aria-hidden="true">{domain && x.ticks(Math.max(2, Math.floor((W - m.l - m.r) / 70))).filter(Number.isInteger).map((t) => <text key={t} x={x(t)} y={H - m.b + 16} textAnchor="middle">{label(t)}</text>)}</g>
          <g>{evTitles.map((t) => {
            const key = `t${t.year}`;
            return (
              <g key={key} role="img" aria-label={`${say("trophy.champion")} ${label(t.year)}`} {...card.bind(key, () => <><b>{label(t.year)}</b><div>{say("player.titleTip", { team: t.team ?? "", league: g.league.toUpperCase() })}</div></>)}>
                <rect className="hit" x={x(t.year) - 10} y={H - m.b + 22} width={20} height={20} />
                <text className="glyph star" x={x(t.year)} y={H - m.b + 38} textAnchor="middle">★</text>
              </g>
            );
          })}</g>
          <g>{[...awardsBy].map(([yr, names]) => {
            const key = `a${yr}`;
            return (
              <g key={key} role="img" aria-label={`${names.join(", ")} ${label(yr)}`} {...card.bind(key, () => <><b>{label(yr)}</b>{names.map((n) => <div key={n}>{n}</div>)}</>)}>
                <circle className="badge-dot" cx={x(yr)} cy={H - m.b + 54} r={9} />
                <text className="badge-t" x={x(yr)} y={H - m.b + 57.5} textAnchor="middle">{names.length > 1 ? String(names.length) : awardBadge(names[0]).slice(0, 2)}</text>
              </g>
            );
          })}</g>
        </svg>
        {card.element}
      </div>
      <p className="note pnote">
        {reached.length ? reached.map((r) => `${num(r.mark)} ${lbl} · ${label(r.year)}`).join(" — ") : say("charts.noMilestone")}
        {evTitles.length || evAwards.length ? ` ${say("charts.eventsNote", { titles: plural("count.championships", evTitles.length), awards: plural("count.awards", evAwards.length) })}` : ""}
      </p>
    </div>
  );
}
