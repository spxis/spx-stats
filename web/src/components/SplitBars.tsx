"use client";

import type { TeamGame } from "@/lib/teamSeason";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Home and road records as two stacked bars of wins, ties and losses (an overtime loss is a loss here). */
export function SplitBars({ games }: { games: TeamGame[] }) {
  const { say, fmt } = useSpeaker();
  const [ref, W] = useChartWidth(300, 220);
  const tip = useTooltip(ref);
  const rows = (["Home", "Away"] as const).map((loc) => {
    const gs = games.filter((g) => g.loc === loc && g.res !== "");
    return { loc, label: say(loc === "Away" ? "split.road" : "split.home"), w: gs.filter((g) => g.res === "W").length, l: gs.filter((g) => g.res === "L" || g.res === "OTL").length, t: gs.filter((g) => g.res === "T").length };
  }).filter((r) => r.w + r.l + r.t);
  if (!rows.length) return <div className="chart" ref={ref}><p className="note">{say("chart.noResults")}</p></div>;
  const bh = 30, H = rows.length * (bh + 18) + 4, left = 54, wdt = W - left - 4;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("split.aria")}>
        {rows.map((r, i) => {
          const tot = r.w + r.l + r.t;
          let x0 = left;
          return (
            <g key={r.loc} transform={`translate(0,${i * (bh + 18) + 2})`}>
              <text className="lab" x={0} y={bh / 2 + 5}>{r.label}</text>
              {([["w", say("record.wins"), r.w], ["t", say("record.ties"), r.t], ["l", say("record.losses"), r.l]] as const).map(([k, name, n]) => {
                if (!n) return null;
                const wpx = (wdt * n) / tot, at = x0;
                x0 += wpx;
                return (
                  <g key={k}>
                    <rect className={`seg-${k} bar-wide`} x={at} y={0} width={wpx} height={bh} rx={2} style={{ transformOrigin: `${at}px 0px` }}
                      onMouseMove={(ev) => tip.show(ev, <TipLines title={`${r.label} ${name.toLowerCase()}`} lines={[say("donut.tip", { n: fmt(n), total: fmt(tot), pct: pct1(n / tot) })]} />)}
                      onMouseLeave={tip.hide} />
                    {wpx > 22 ? (
                      <text x={at + wpx / 2} y={bh / 2 + 4} textAnchor="middle" style={{ fill: k === "t" ? "var(--ink)" : "var(--paper)", fontWeight: 600, pointerEvents: "none" }}>{n}</text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {tip.element}
    </div>
  );
}
