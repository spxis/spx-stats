"use client";

import { max, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { fmt3 } from "@/lib/format";
import { seasonLabel } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { teamVars } from "./RankBars";
import { usePaths } from "./SlugProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./alltime.css";

export interface ChartTeam {
  f: number;
  name: string;
  abbr: string;
  href: string;
  tl: string | null;
  td: string | null;
  active: boolean;
  w: number; l: number; t: number; otl: number;
  share: number | null;
  titles: number;
  /** [year, win share or -1 when not worth drawing, 1 when it won the title] for each season. */
  grid: [number, number, number][];
}

/** The pitch every label is checked against, so none sits on another. */
const taken = (boxes: { x0: number; x1: number; y0: number; y1: number }[], b: { x0: number; x1: number; y0: number; y1: number }) =>
  boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

/** Wins against losses, a dot a franchise: above the dashed line it has won more than it has lost; bigger dots have more titles. */
export function WinLossScatter({ teams }: { teams: ChartTeam[] }) {
  const router = useRouter();
  const { say, fmt, plural } = useSpeaker();
  const [ref, W] = useChartWidth(560, 300);
  const tip = useTooltip(ref);
  const list = teams.filter((t) => t.w + t.l + t.otl > 0);
  if (!list.length) return <div className="chart" ref={ref}><p className="note">{say("chart.noResults")}</p></div>;
  const H = Math.round(Math.min(Math.max(W * 0.78, 300), 520)), m = { t: 12, r: 14, b: 40, l: 50 };
  const top = max(list, (t) => Math.max(t.w, t.l + t.otl)) || 1;
  const x = scaleLinear([0, top], [m.l, W - m.r]).nice(), y = scaleLinear([0, top], [H - m.b, m.t]).nice();
  const r = (t: ChartTeam) => 4 + 2.4 * Math.sqrt(t.titles);
  const ticks = x.ticks(Math.max(3, Math.floor(W / 110)));
  const yticks = y.ticks(5);
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = list.map((t) => ({ x0: x(t.l + t.otl) - r(t), x1: x(t.l + t.otl) + r(t), y0: y(t.w) - r(t), y1: y(t.w) + r(t) }));
  const labels = new Map<number, [number, number]>();
  for (const t of [...list].sort((a, b) => b.titles - a.titles || b.w + b.l - (a.w + a.l)).slice(0, W < 480 ? 10 : 22)) {
    const cx = x(t.l + t.otl), cy = y(t.w), wd = t.abbr.length * 7 + 4;
    const spots = [[cx + r(t) + 3, cy - 6], [cx - r(t) - 3 - wd, cy - 6], [cx - wd / 2, cy - r(t) - 14], [cx - wd / 2, cy + r(t) + 2]];
    const at = spots.find(([sx, sy]) => sx > m.l && sx + wd < W && !taken(boxes, { x0: sx, x1: sx + wd, y0: sy, y1: sy + 12 }));
    if (!at) continue;
    boxes.push({ x0: at[0], x1: at[0] + wd, y0: at[1], y1: at[1] + 12 });
    labels.set(t.f, [at[0], at[1]]);
  }
  const dots = [...list].sort((a, b) => b.titles - a.titles || b.w - a.w);
  return (
    <div className="chart atscatter" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("allTime.scatter.aria")}>
        <g>{yticks.map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" />)}</g>
        <g>{yticks.map((v) => <text key={v} x={m.l - 6} y={y(v)} dy="0.32em" textAnchor="end">{fmt(v)}</text>)}</g>
        <g>{ticks.map((v) => <text key={v} x={x(v)} y={H - m.b + 16} textAnchor="middle">{fmt(v)}</text>)}</g>
        <line className="diag" x1={x(0)} y1={y(0)} x2={x(Math.min(x.domain()[1], y.domain()[1]))} y2={y(Math.min(x.domain()[1], y.domain()[1]))} />
        <text className="axis" x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">{say("allTime.scatter.x")}</text>
        <text className="axis" transform={`translate(12,${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">{say("allTime.scatter.y")}</text>
        <g>{dots.map((t) => (
          <circle key={t.f} className={`at-c${t.active ? "" : " gone"}`} style={teamVars(t)} cx={x(t.l + t.otl)} cy={y(t.w)} r={r(t)} tabIndex={0} role="link"
            aria-label={`${t.name}: ${t.w}–${t.l + t.otl}`}
            onClick={() => router.push(t.href)} onKeyDown={(e) => { if (e.key === "Enter") router.push(t.href); }}
            onMouseMove={(ev) => tip.show(ev, <TipLines title={t.name} lines={[
              `${t.w}–${t.l}${t.t ? `–${t.t}` : ""}${t.otl ? `–${t.otl}` : ""}`,
              say("winline.share", { share: t.share == null ? "—" : fmt3(t.share) }),
              t.titles ? plural("count.championships", t.titles) : null,
              t.active ? null : say("allTime.defunct"),
            ]} />)}
            onMouseLeave={tip.hide} />
        ))}</g>
        <g>{list.filter((t) => labels.has(t.f)).map((t) => {
          const at = labels.get(t.f)!;
          return <text key={t.f} className="pt" x={at[0]} y={at[1] + 10}>{t.abbr}</text>;
        })}</g>
      </svg>
      {tip.element}
    </div>
  );
}

const cellFill = (s: number) => (s >= 0.5
  ? `color-mix(in srgb, var(--accent) ${Math.round(18 + 82 * Math.min(1, (s - 0.5) / 0.22))}%, var(--soft))`
  : `color-mix(in srgb, var(--ink) ${Math.round(8 + 52 * Math.min(1, (0.5 - s) / 0.22))}%, var(--soft))`);

/** One row a franchise, one square a season, shaded by win share (warm above .500, grey below); an amber dot marks a title. Rows run oldest to newest. */
export function SeasonGrid({ lg, teams, first, last }: { lg: string; teams: ChartTeam[]; first: number; last: number }) {
  const router = useRouter();
  const paths = usePaths();
  const { say, plural } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 620);
  const tip = useTooltip(ref);
  const rows = [...teams].filter((t) => t.grid.length).sort((a, b) => a.grid[0][0] - b.grid[0][0] || a.name.localeCompare(b.name));
  if (!rows.length) return <div className="chart" ref={ref}><p className="note">{say("chart.noResults")}</p></div>;
  const wide = W >= 760;
  const left = wide ? 168 : 46, top = 20, rh = 13, years = last - first + 1;
  const cw = (W - left - 4) / years, H = top + rows.length * rh + 4;
  const x = (y: number) => left + (y - first) * cw;
  const decades = Array.from({ length: Math.floor(last / 10) - Math.ceil(first / 10) + 1 }, (_, i) => (Math.ceil(first / 10) + i) * 10);
  const yearAt = (ev: { clientX: number }) => {
    const box = ref.current?.querySelector("svg")?.getBoundingClientRect();
    return first + Math.floor(((box ? ((ev.clientX - box.left) * W) / box.width : 0) - left) / cw);
  };
  const clip = (s: string) => (s.length > 25 ? `${s.slice(0, 24)}…` : s);
  return (
    <div className="chart scroll atgrid" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }} role="img" aria-label={say("allTime.grid.aria")}>
        <g>{decades.map((d) => <text key={d} x={x(d)} y={11} textAnchor="middle">{d}</text>)}</g>
        <g>{decades.map((d) => <line key={d} x1={x(d)} x2={x(d)} y1={top - 3} y2={H - 4} stroke="var(--rule)" />)}</g>
        {rows.map((t, i) => (
          <g key={t.f} className="at-c" style={teamVars(t)} transform={`translate(0,${top + i * rh})`}>
            <text className={`rowlab${t.active ? "" : " gone"}`} x={left - 6} y={rh - 3} textAnchor="end">{wide ? clip(t.name) : t.abbr}</text>
            {t.grid.map(([y, s]) => (
              <rect key={y} x={x(y) + 0.3} y={1} width={Math.max(1, cw - 0.6)} height={rh - 2} fill={s < 0 ? "var(--soft)" : cellFill(s)} opacity={s < 0 ? 0.6 : 1} />
            ))}
            {t.grid.filter((g) => g[2]).map(([y]) => <circle key={y} className="champ" cx={x(y) + cw / 2} cy={rh / 2} r={Math.min(3.2, Math.max(1.6, cw * 0.45))} />)}
            <rect className="rowhit" x={left} y={0} width={W - left} height={rh}
              onClick={(ev) => {
                const y = yearAt(ev);
                const g = t.grid.find((s) => s[0] === y) ?? t.grid.reduce((a, b) => (Math.abs(b[0] - y) < Math.abs(a[0] - y) ? b : a));
                router.push(paths.teamSeason(lg, t.f, g[0]));
              }}
              onMouseMove={(ev) => {
                const g = t.grid.find((s) => s[0] === yearAt(ev));
                tip.show(ev, g
                  ? <TipLines title={`${t.name} · ${seasonLabel(lg, g[0])}`} lines={[g[1] < 0 ? say("allTime.grid.partial") : say("winline.share", { share: fmt3(g[1]) }), g[2] ? say("winline.won") : null]} />
                  : <TipLines title={t.name} lines={[`${seasonLabel(lg, t.grid[0][0])} – ${seasonLabel(lg, t.grid.at(-1)![0])}`, plural("count.seasons", t.grid.length)]} />);
              }}
              onMouseLeave={tip.hide} />
          </g>
        ))}
      </svg>
      {tip.element}
    </div>
  );
}
