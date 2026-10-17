"use client";

import { useMemo, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { atUtc } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { buildHeat, heatRecord, type DayTone, type HeatCell, type HeatGame, type HeatYear } from "@/lib/resultHeat";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import "./resultHeat.css";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 22;
const TOP = 16;

function hrefOf(lg: string, games: readonly HeatGame[]): string | null {
  const g = games[0];
  return g ? gamePath(lg, g.year, g.id, g.awayName, g.homeName) : null;
}

function toneClass(tone: DayTone): string {
  if (tone === "W" || tone === "L" || tone === "T" || tone === "OTL") return tone;
  if (tone === "split" || tone === "pending") return tone;
  return "empty";
}

/**
 * A GitHub-style calendar of one club's results: a square for every day from the first game through the last.
 * Days with no game stay empty. Colour is W / L / T / OTL (the same result colours as the rest of the site).
 */
export function ResultHeat({ lg, games, compact = false }: { lg: string; games: readonly HeatGame[]; compact?: boolean }) {
  const { say, dt } = useSpeaker();
  const router = useRouter();
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const grid = useMemo(() => buildHeat(games), [games]);
  const splitId = useMemo(() => `rheat-split-${lg}-${games[0]?.id ?? 0}-${games.length}`, [lg, games]);
  if (!grid) return <p className="note">{say("rheat.empty")}</p>;

  const has = (t: DayTone) => grid.years.some((y) => y.weeks.some((w) => w.some((c) => c?.tone === t)));
  const legend: { tone: DayTone | "empty"; key: "result.win" | "result.loss" | "result.tie" | "result.lostOt" | "rheat.legend.none" | "rheat.legend.pending" | "rheat.legend.split" }[] = [
    { tone: "W", key: "result.win" },
    { tone: "L", key: "result.loss" },
    ...(has("T") ? [{ tone: "T" as const, key: "result.tie" as const }] : []),
    ...(has("OTL") ? [{ tone: "OTL" as const, key: "result.lostOt" as const }] : []),
    { tone: "empty", key: "rheat.legend.none" },
    ...(has("pending") ? [{ tone: "pending" as const, key: "rheat.legend.pending" as const }] : []),
    ...(has("split") ? [{ tone: "split" as const, key: "rheat.legend.split" as const }] : []),
  ];

  const cardOf = (c: HeatCell) => {
    const title = dt.full(atUtc(c.date));
    if (!c.games.length) return { title, lines: [say("rheat.card.none")] };
    const lines = c.games.map((g) => {
      const opp = g.home ? g.awayName : g.homeName;
      const res = g.res ? say(RESULT_KEY[g.res]) : say("rheat.legend.pending");
      const score = g.mine != null && g.theirs != null ? `${g.mine}–${g.theirs}` : "·";
      const ot = g.ot ? ` ${say(lg === "mlb" ? "game.extras" : "game.ot")}` : "";
      return say(g.home ? "rheat.card.home" : "rheat.card.away", { res, score: `${score}${ot}`, opp: opp ?? "—" });
    });
    return { title, lines };
  };

  const open = (c: HeatCell) => {
    const href = hrefOf(lg, c.games);
    if (href) router.push(href);
  };
  const onKey = (ev: KeyboardEvent<SVGRectElement>, c: HeatCell) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(c); }
  };
  const showTip = (ev: MouseEvent<SVGRectElement>, c: HeatCell) => {
    const card = cardOf(c);
    tip.show(ev, <TipLines title={card.title} lines={card.lines} />);
  };

  return (
    <div className={`rheat${compact ? " compact" : ""}`} ref={box}>
      <div className="rheat-head">
        <span className="rheat-rec">{heatRecord(grid.tally)}</span>
        <span className="rheat-span">{say("rheat.span", { from: dt.ymd(atUtc(grid.first)), to: dt.ymd(atUtc(grid.last)) })}</span>
      </div>
      <div className="rheat-legend" aria-hidden="true">
        {legend.map((x) => <span key={x.key}><i className={`sq ${toneClass(x.tone === "empty" ? null : x.tone)}`} /><span>{say(x.key)}</span></span>)}
      </div>
      {grid.years.map((y) => (
        <YearGraph key={y.year} year={y} lg={lg} splitId={splitId} weekdays={dt.weekdays} mon={(d) => dt.mon(atUtc(d))}
          aria={say("rheat.yearAria", { year: String(y.year) })} cardOf={cardOf} onOpen={open} onKey={onKey} showTip={showTip} hideTip={tip.hide} />
      ))}
      {tip.element}
    </div>
  );
}

function YearGraph({ year, lg, splitId, weekdays, mon, aria, cardOf, onOpen, onKey, showTip, hideTip }: {
  year: HeatYear; lg: string; splitId: string; weekdays: string[]; mon: (date: string) => string; aria: string;
  cardOf: (c: HeatCell) => { title: string; lines: string[] };
  onOpen: (c: HeatCell) => void;
  onKey: (ev: KeyboardEvent<SVGRectElement>, c: HeatCell) => void;
  showTip: (ev: MouseEvent<SVGRectElement>, c: HeatCell) => void;
  hideTip: () => void;
}) {
  const n = year.weeks.length;
  const W = LEFT + n * STEP;
  const H = TOP + 7 * STEP;
  const monthAt = (i: number): string | null => {
    const week = year.weeks[i]!;
    const days = week.filter((c): c is HeatCell => c != null);
    if (!days.length) return null;
    const first = days.find((c) => c.date.endsWith("-01"));
    if (first) return mon(first.date);
    if (i === 0) return mon(days[0]!.date);
    return null;
  };
  return (
    <div className="rheat-year">
      <div className="rheat-yl">{year.year}</div>
      <div className="rheat-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={aria}>
          <defs>
            <linearGradient id={`${splitId}-${year.year}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="50%" stopColor="color-mix(in srgb, var(--ok) 72%, var(--panel))" />
              <stop offset="50%" stopColor="color-mix(in srgb, var(--bad) 68%, var(--panel))" />
            </linearGradient>
          </defs>
          {year.weeks.map((_, i) => {
            const label = monthAt(i);
            return label ? <text key={`m${i}`} className="lab" x={LEFT + i * STEP} y={10}>{label}</text> : null;
          })}
          {[1, 3, 5].map((d) => (
            <text key={d} className="lab" x={0} y={TOP + d * STEP + CELL - 1}>{weekdays[d]!.slice(0, 1)}</text>
          ))}
          {year.weeks.map((week, i) => week.map((c, d) => {
            if (!c) return null;
            const href = hrefOf(lg, c.games);
            const card = cardOf(c);
            const cls = toneClass(c.tone);
            const fill = c.tone === "split" ? `url(#${splitId}-${year.year})` : undefined;
            return (
              <rect key={c.date} className={`sq ${cls}${href ? " link" : ""}`} x={LEFT + i * STEP} y={TOP + d * STEP}
                width={CELL} height={CELL} fill={fill} role={href ? "link" : "img"} tabIndex={href ? 0 : undefined}
                aria-label={[card.title, ...card.lines].join(". ")}
                onClick={() => { if (href) onOpen(c); }}
                onKeyDown={(ev) => { if (href) onKey(ev, c); }}
                onMouseMove={(ev) => showTip(ev, c)} onMouseLeave={hideTip} />
            );
          }))}
        </svg>
      </div>
    </div>
  );
}
