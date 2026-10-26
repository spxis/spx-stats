"use client";

import { useEffect, useMemo, useState } from "react";
import { enoughPlayed, radarOf, topPercent, type GroupView, type RadarPoint } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { showStat } from "@/lib/playerStats";
import { useSpeaker } from "./i18n/LocaleProvider";
import { whoKey } from "./PlayerHero";
import { usePointCard } from "./usePointCard";
import type { BoardView } from "./playerView";

const H = 300;

/** A label on at most two lines, broken at a space near 14 characters. */
export function lines(text: string): string[] {
  if (text.length <= 14 || !text.includes(" ")) return [text];
  const words = text.split(" "), out: string[] = [""];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && (last + " " + w).length > 14 && out.length < 2) out.push(w); else out[out.length - 1] = last ? `${last} ${w}` : w;
  }
  return out;
}

const kindOf = (ref: string) => (["avg", "obp", "slg", "svp"].includes(ref) ? "rate3" : "rate2") as "rate3" | "rate2";

/**
 * The player against the league: for each rate that matters to their position, the share of that season's players of the same kind that the
 * player's figure beats, over the seasons they played in the range. 100 is the best in the league; a lower-is-better figure (ERA, goals against)
 * is turned round so outward is always better. Hidden until the league's figures are loaded (migration 064) and while the player has played too
 * little in the range for a comparison to mean anything.
 */
export function PlayerRadar({ view, g }: { view: BoardView; g: GroupView }) {
  const { say, fmt } = useSpeaker();
  const phase = view.state.phase;
  const points = useMemo(() => (view.refs.size ? radarOf(g.def, g.rows, view.refs, phase) : []), [view.refs, g.def, g.rows, phase]);
  const known = points.filter((p): p is RadarPoint & { pct: number; value: number } => p.pct != null && p.value != null);
  const keys = known.map((p) => p.ref);
  const card = usePointCard(keys);
  // The chart's box can appear after the first render (not enough played yet, then enough), so its width is read from the element itself.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [W, setW] = useState(360);
  useEffect(() => {
    if (!box) return;
    const measure = () => setW(Math.max(260, Math.round(box.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const who = say(whoKey(g.def.id, view.data.bucket));
  if (!view.refs.size || !enoughPlayed(g.def.id, phase, g.total) || known.length < 1) return null;

  const R = Math.max(46, Math.min(104, (W - 200) / 2)), cx = W / 2, cy = H / 2 + 4;
  const angle = (i: number) => -Math.PI / 2 + (i / known.length) * Math.PI * 2;
  const at = (i: number, f: number) => [cx + Math.cos(angle(i)) * R * f, cy + Math.sin(angle(i)) * R * f] as const;
  const poly = known.map((p, i) => at(i, p.pct).join(",")).join(" ");
  const figure = (p: RadarPoint & { value: number }) => showStat(kindOf(p.ref), p.value, fmt);
  const sentence = (p: RadarPoint & { pct: number }) => (p.pct >= 0.75 ? say("hero.top", { pct: fmt(topPercent(p.pct)), who }) : say("hero.ahead", { pct: fmt(Math.round(p.pct * 100)), who }));
  const best = [...known].sort((a, b) => b.pct - a.pct)[0];
  const body = (p: RadarPoint & { pct: number; value: number }) => (
    <>
      <b>{say(p.label as PhraseKey)}</b>
      <div>{figure(p)}</div>
      <div>{sentence(p)}</div>
      {p.low ? <div>{say("radar.lowNote")}</div> : null}
    </>
  );
  return (
    <div className="pchart pradar">
      <h3>{say("charts.radar", { who })}</h3>
      <p className="note">{say("charts.radarNote", { who })}</p>
      <div className="radarwrap">
        <div className="chart" data-marks ref={setBox}>
          {known.length >= 3 ? (
            <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={say("charts.radarAria", { who })}>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <polygon key={f} className={f === 0.5 ? "ring median" : "ring"} points={known.map((_, i) => at(i, f).join(",")).join(" ")} />
              ))}
              {known.map((_, i) => <line key={i} className="spoke" x1={cx} y1={cy} x2={at(i, 1)[0]} y2={at(i, 1)[1]} />)}
              <text className="ringlab" x={cx + 3} y={cy - R * 0.5 - 2}>{fmt(50)}</text>
              <polygon className="shape" points={poly} />
              {known.map((p, i) => {
                const [px, py] = at(i, p.pct), [lx, ly] = at(i, 1.2);
                const anchor = Math.abs(lx - cx) < 12 ? "middle" : lx > cx ? "start" : "end";
                return (
                  <g key={p.ref} role="img" aria-label={`${say(p.label as PhraseKey)}: ${figure(p)}, ${sentence(p)}`} {...card.bind(p.ref, () => body(p))}>
                    <circle className="hitdot" cx={px} cy={py} r={13} />
                    <circle className="rdot" cx={px} cy={py} r={4} />
                    <text className="axlab" x={lx} y={ly} textAnchor={anchor}>{lines(say(p.label as PhraseKey)).map((t, k, all) => <tspan key={k} x={lx} dy={k === 0 ? `${0.32 - (all.length - 1) * 0.6}em` : "1.2em"}>{t}</tspan>)}</text>
                  </g>
                );
              })}
            </svg>
          ) : null}
          {card.element}
        </div>
        <ul className="rlist">
          {known.map((p) => (
            <li key={p.ref}>
              <span className="rl">{say(p.label as PhraseKey)}</span>
              <span className="rv">{figure(p)}</span>
              <span className="rbar" role="img" aria-label={sentence(p)}><i style={{ width: `${Math.round(p.pct * 100)}%` }} /></span>
              <span className="rp">{fmt(Math.round(p.pct * 100))}</span>
            </li>
          ))}
        </ul>
      </div>
      {best ? <p className="rreading"><b>{say("radar.best", { axis: say(best.label as PhraseKey), text: sentence(best) })}</b></p> : null}
    </div>
  );
}
