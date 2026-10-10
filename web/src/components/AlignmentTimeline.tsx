"use client";

import { scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { hrefWith } from "@/lib/urlQuery";
import { seasonLabel } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./alignment.css";

export interface TimelineLane {
  key: string;
  conference: string | null;
  division: string | null;
  /** The lane's name as drawn on the left. */
  label: string;
  spans: { from: number; to: number }[];
  /** [year, clubs] */
  counts: [number, number][];
  /** Clubs that arrived in this lane, by year (they moved in, or the club began). */
  arrivals: [number, string[]][];
}

interface Props {
  lg: string;
  lanes: TimelineLane[];
  first: number;
  last: number;
  selected: number;
}

const ROW = 24, CONF = 28, PAD_T = 22, PAD_B = 24;

/**
 * When each conference and division existed, a lane to a division and a bar to each unbroken stretch of seasons. A ring on
 * a bar marks a season in which clubs moved into it. Pressing a bar opens that season's alignment (?season=); the
 * dashed line is the season being shown.
 */
export function AlignmentTimeline({ lg, lanes, first, last, selected }: Props) {
  const { say, plural } = useSpeaker();
  const router = useRouter();
  const [ref, W] = useChartWidth(1000, 320);
  const tip = useTooltip(ref);
  const narrow = W < 560;
  const labelW = narrow ? 104 : 190;
  const plotMin = 640;
  const right = 12;
  const plotW = Math.max(W - labelW - right, plotMin - labelW);
  const total = labelW + plotW + right;

  const rows = useMemo(() => {
    const out: ({ kind: "conf"; name: string; y: number } | { kind: "lane"; lane: TimelineLane; y: number })[] = [];
    let y = PAD_T, conf: string | null | undefined;
    const anyConf = lanes.some((l) => l.conference);
    for (const lane of lanes) {
      if (lane.conference !== conf && (lane.conference || anyConf)) { y += out.length ? 6 : 0; out.push({ kind: "conf", name: lane.conference ?? say("align.noConference"), y }); y += CONF; }
      conf = lane.conference;
      out.push({ kind: "lane", lane, y }); y += ROW;
    }
    return { items: out, height: y + PAD_B };
  }, [lanes, say]);

  const x = scaleLinear([first, last + 1], [labelW, labelW + plotW]);
  const step = last - first > 80 ? 20 : last - first > 40 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = Math.ceil(first / step) * step; t <= last; t += step) ticks.push(t);
  const H = rows.height;
  const pick = (year: number) => router.replace(hrefWith({ season: String(year) }), { scroll: false });

  return (
    <div className="chart aligntl" ref={ref}>
      <svg className="timeline" viewBox={`0 0 ${total} ${H}`} style={{ width: total, maxWidth: "none", height: H }} role="img"
        aria-label={say("align.timelineAria", { league: lg.toUpperCase(), from: seasonLabel(lg, first), to: seasonLabel(lg, last) })}>
        <g>{ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD_T - 6} y2={H - PAD_B + 2} stroke="var(--rule)" />
            <text x={x(t)} y={H - 6} textAnchor="middle">{t}</text>
          </g>
        ))}</g>
        {rows.items.map((r) => r.kind === "conf" ? (
          <text key={`c${r.name}${r.y}`} className="conf-label" x={0} y={r.y + 16}>{r.name}</text>
        ) : (
          <g key={r.lane.key}>
            <text className="lane-label" x={narrow ? 8 : 12} y={r.y + ROW / 2} dy="0.32em">{r.lane.label}</text>
            {r.lane.spans.map((s) => (
              <rect key={s.from} className="bar" x={x(s.from)} y={r.y + 3} width={Math.max(x(s.to + 1) - x(s.from), 2)} height={ROW - 6} rx={2}
                style={{ cursor: "pointer" }}
                onClick={() => pick(Math.min(Math.max(selected, s.from), s.to))}
                onMouseMove={(ev) => {
                  const rect = ev.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  const yr = rect ? Math.min(Math.max(Math.floor(x.invert(ev.clientX - rect.left)), s.from), s.to) : s.from;
                  const n = r.lane.counts.find(([y]) => y === yr)?.[1];
                  const arrived = r.lane.arrivals.find(([y]) => y === yr)?.[1];
                  tip.show(ev, <TipLines title={r.lane.label} lines={[
                    s.to > s.from ? say("align.span", { from: seasonLabel(lg, s.from), to: seasonLabel(lg, s.to) }) : seasonLabel(lg, s.from),
                    n != null ? say("align.seasonClubs", { season: seasonLabel(lg, yr), clubs: plural("count.clubs", n) }) : null,
                    arrived?.length ? say("align.movedIn", { clubs: arrived.join(", ") }) : null,
                  ]} />);
                }}
                onMouseLeave={tip.hide}>
                <title>{say("align.barTitle", { label: r.lane.label, from: seasonLabel(lg, s.from), to: seasonLabel(lg, s.to) })}</title>
              </rect>
            ))}
            {r.lane.division ? r.lane.arrivals.filter(([y]) => y > r.lane.spans[0].from).map(([y, names]) => (
              <circle key={y} className="arrive" cx={x(y) + 1} cy={r.y + ROW / 2} r={3 + Math.min(names.length, 5) * 0.5} pointerEvents="none" />
            )) : null}
          </g>
        ))}
        <line className="here" x1={x(selected + 0.5)} x2={x(selected + 0.5)} y1={PAD_T - 8} y2={H - PAD_B + 2} />
      </svg>
      {tip.element}
    </div>
  );
}
