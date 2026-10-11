"use client";

import { area, bisector, curveStepAfter, extent, line, pointer, scaleLinear } from "d3";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fmt3, atUtc } from "@/lib/format";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { playedInOrder, type TeamGame } from "@/lib/teamSeason";
import { useSpeaker } from "./i18n/LocaleProvider";
import { idleLink, type RowId, type RowLink } from "./rowLink";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

interface Point { n: number; diff: number; share: number; g: TeamGame }

/**
 * Wins minus losses after each game with a result, in the order played: how far over (or under) .500 the team stood.
 * With a `link` the chart and the games table light each other up by game id: a row under the pointer or focus marks its point
 * here, a point under the pointer (a first tap on touch) lights its row, and pressing a point pins it and scrolls its row into view.
 * The arrow keys walk the points, Enter pins, Escape lets go.
 */
export function RunningLine({ games, link }: { games: TeamGame[]; link?: RowLink }) {
  const { say, dt } = useSpeaker();
  const [ref, W] = useChartWidth(300, 300);
  const tip = useTooltip(ref);
  const l = link ?? idleLink;
  const [at, setAt] = useState<number | null>(null);
  const [key, setKey] = useState<number | null>(null);
  const armed = useRef(false);
  const tableId = useSyncExternalStore(l.subscribe, () => l.get().table, () => null);
  const pinId = useSyncExternalStore(l.subscribe, () => l.get().pin, () => null);
  const pts = useMemo(() => {
    const out: Point[] = [];
    let diff = 0, w = 0;
    playedInOrder(games).forEach((g, i) => {
      if (g.res === "W") { w++; diff++; } else if (g.res === "L" || g.res === "OTL") diff--; else w += 0.5;
      out.push({ n: i + 1, diff, share: w / (i + 1), g });
    });
    return out;
  }, [games]);
  const index = useMemo(() => new Map<RowId, number>(pts.map((p, i) => [p.g.id, i])), [pts]);

  useEffect(() => {
    if (at == null) return;
    const away = (ev: PointerEvent) => {
      if (ev.pointerType !== "touch" || ref.current?.contains(ev.target as Node)) return;
      setAt(null);
      tip.hide();
      l.set({ chart: null });
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [at, ref, tip, l]);

  useEffect(() => {
    if (pinId == null) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") l.set({ pin: null }); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pinId, l]);

  if (pts.length < 2) return <div className="chart" ref={ref}><p className="note">{say("running.none")}</p></div>;
  const H = 240, m = { t: 14, r: 12, b: 26, l: 40 };
  const x = scaleLinear([1, pts.length], [m.l, W - m.r]);
  const [lo = 0, hi = 0] = extent(pts, (p) => p.diff);
  const y = scaleLinear([Math.min(lo, 0), Math.max(hi, 0)], [H - m.b, m.t]).nice();
  const ticks = y.ticks(4);
  const bis = bisector<Point, number>((p) => p.n).center;
  const fromRow = tableId != null ? index.get(tableId) ?? null : null;
  const lit = at ?? fromRow ?? key;
  const cur = lit == null ? null : pts[lit];
  const pinned = pinId != null ? index.get(pinId) ?? null : null;
  const last = pts.length - 1;

  const lines = (p: Point) => [
    say(p.g.loc === "Home" ? "running.vs" : "running.at", { res: say(RESULT_KEY[p.g.res as keyof typeof RESULT_KEY]), mine: p.g.mine ?? "", theirs: p.g.theirs ?? "", opp: p.g.oppName ?? "—" }),
    say("running.record", { rec: p.g.rec }),
    say("running.over", { diff: (p.diff > 0 ? "+" : "") + p.diff, share: fmt3(p.share) }),
  ];
  const title = (p: Point) => say("running.game", { n: p.n, date: dt.monthDayShort(atUtc(p.g.date)) });
  const tipFor = (p: Point) => <TipLines title={title(p)} lines={lines(p)} />;
  const pick = (ev: React.MouseEvent<SVGRectElement>) => {
    const [mx] = pointer(ev.nativeEvent, ev.currentTarget);
    return Math.max(0, Math.min(last, bis(pts, x.invert(mx))));
  };
  const preview = (ev: React.MouseEvent<SVGRectElement>, i: number) => {
    setAt(i);
    if (l.get().chart !== pts[i].g.id) l.set({ chart: pts[i].g.id });
    tip.show(ev, tipFor(pts[i]));
  };
  const walk = (i: number) => {
    setKey(i);
    l.set({ chart: pts[i].g.id });
  };
  const keys: Record<string, (i: number) => number> = {
    ArrowRight: (i) => i + 1, ArrowUp: (i) => i + 1, ArrowLeft: (i) => i - 1, ArrowDown: (i) => i - 1,
    PageUp: (i) => i + 10, PageDown: (i) => i - 10, Home: () => 0, End: () => last,
  };
  // A point lit from the table or the keyboard has no pointer to follow, so its readout sits by the point.
  const px = cur ? x(cur.n) : 0, py = cur ? y(cur.diff) : 0;
  const side = px > W / 2, below = py < H / 2;

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={say("running.aria")}>
        <g aria-hidden="true">
          <g>{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
          <g>{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{(t > 0 ? "+" : "") + t}</text>)}</g>
          <g>{x.ticks(Math.min(8, pts.length)).filter(Number.isInteger).map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v}</text>)}</g>
          <line className="zero" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
          <path d={area<Point>().x((p) => x(p.n)).y0(y(0)).y1((p) => y(p.diff)).curve(curveStepAfter)(pts) ?? undefined} fill="var(--accent)" opacity={0.14} />
          <path className="line-draw" pathLength={1} d={line<Point>().x((p) => x(p.n)).y((p) => y(p.diff)).curve(curveStepAfter)(pts) ?? undefined}
            fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          {pinned != null && pinned !== lit ? <circle className="pinmark" cx={x(pts[pinned].n)} cy={y(pts[pinned].diff)} r={6} /> : null}
          {cur ? (
            <>
              <line className="guide" x1={px} x2={px} y1={m.t} y2={H - m.b} />
              <circle cx={px} cy={py} r={5} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1.5} />
              {pinned === lit ? <circle className="pinmark" cx={px} cy={py} r={7} /> : null}
            </>
          ) : null}
        </g>
        <rect x={m.l} y={0} width={W - m.l - m.r} height={H - m.b} fill="transparent" style={{ touchAction: "pan-y", cursor: "pointer" }}
          tabIndex={0} role="slider" aria-label={say("running.aria")} aria-orientation="horizontal"
          aria-valuemin={1} aria-valuemax={pts.length} aria-valuenow={(lit ?? pinned ?? last) + 1}
          aria-valuetext={`${title(pts[lit ?? pinned ?? last])}. ${lines(pts[lit ?? pinned ?? last]).join(". ")}`}
          onPointerMove={(ev) => preview(ev, pick(ev))}
          onPointerDown={(ev) => {
            if (ev.pointerType !== "touch") { armed.current = false; return; }
            const i = pick(ev);
            armed.current = i !== at;
            if (armed.current) preview(ev, i);
          }}
          onPointerCancel={() => { armed.current = false; }}
          onPointerLeave={(ev) => {
            if (ev.pointerType === "touch") return;
            tip.hide();
            setAt(null);
            if (key == null) l.set({ chart: null });
          }}
          onClick={(ev) => {
            if (armed.current) { armed.current = false; return; }
            l.pin(pts[at ?? pick(ev)].g.id);
          }}
          onFocus={(ev) => { if (ev.currentTarget.matches(":focus-visible")) walk(pinned ?? last); }}
          onBlur={() => { setKey(null); if (at == null) l.set({ chart: null }); }}
          onKeyDown={(ev) => {
            const go = keys[ev.key];
            if (go) { ev.preventDefault(); walk(Math.max(0, Math.min(last, go(key ?? pinned ?? last)))); }
            else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); l.pin(pts[key ?? pinned ?? last].g.id); }
          }} />
      </svg>
      {tip.element ?? (cur && at == null ? (
        <div className="tip" style={{ left: px + (side ? -14 : 14), top: py + (below ? 14 : -14), transform: `translate(${side ? "-100%" : "0"}, ${below ? "0" : "-100%"})` }}>{tipFor(cur)}</div>
      ) : null)}
    </div>
  );
}
