"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./yearrange.css";

interface Props {
  min: number;
  max: number;
  from: number;
  to: number;
  /** `final` is false while a handle is being dragged (at most once per frame) and true when the change is settled. */
  onChange: (from: number, to: number, final: boolean) => void;
}

const PAD = 16; // half of a handle's hit area, in px: keeps the handles inside the track at both ends

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Two handles on one line that narrow a chart to the years from..to. A handle never crosses the other; one season is the least. */
export function YearRange({ min, max, from, to, onChange }: Props) {
  const { say } = useSpeaker();
  const track = useRef<HTMLDivElement | null>(null);
  const thumbs = useRef<{ start: HTMLDivElement | null; end: HTMLDivElement | null }>({ start: null, end: null });
  const live = useRef({ from, to });
  const drag = useRef<"start" | "end" | null>(null);
  const raf = useRef(0);
  const full = from <= min && to >= max;
  useEffect(() => { if (!drag.current && !raf.current) live.current = { from, to }; }, [from, to]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const frac = (y: number) => (max > min ? (y - min) / (max - min) : 0);

  function set(which: "start" | "end", value: number, final: boolean) {
    const cur = live.current;
    const next = which === "start" ? { from: clamp(value, min, cur.to), to: cur.to } : { from: cur.from, to: clamp(value, cur.from, max) };
    if (next.from === cur.from && next.to === cur.to && !final) return;
    live.current = next;
    if (final) { cancelAnimationFrame(raf.current); raf.current = 0; onChange(next.from, next.to, true); return; }
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; onChange(live.current.from, live.current.to, false); });
  }

  function yearAt(clientX: number): number {
    const r = track.current!.getBoundingClientRect();
    const w = Math.max(1, r.width - 2 * PAD);
    return clamp(Math.round(min + ((clientX - r.left - PAD) / w) * (max - min)), min, max);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const v = yearAt(e.clientX), { from: f, to: t } = live.current;
    const which = v < f ? "start" : v > t ? "end" : f === t ? (f >= max ? "start" : "end") : v - f <= t - v ? "start" : "end";
    drag.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
    thumbs.current[which]?.focus({ preventScroll: true });
    e.preventDefault();
    set(which, v, false);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) set(drag.current, yearAt(e.clientX), false);
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const which = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    set(which, which === "start" ? live.current.from : live.current.to, true);
  }

  function key(which: "start" | "end", e: KeyboardEvent<HTMLDivElement>) {
    const cur = which === "start" ? live.current.from : live.current.to;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    let v: number | undefined;
    if (e.key in step) v = cur + step[e.key];
    else if (e.key === "Home") v = which === "start" ? min : live.current.from;
    else if (e.key === "End") v = which === "start" ? live.current.to : max;
    if (v === undefined) return;
    e.preventDefault();
    set(which, v, true);
  }

  const handle = (which: "start" | "end") => {
    const value = which === "start" ? from : to;
    const lo = which === "start" ? min : from, hi = which === "start" ? to : max;
    const top = from === to ? (from >= max ? which === "start" : which === "end") : false;
    return (
      <div
        key={which}
        ref={(el) => { thumbs.current[which] = el; }}
        className="yr-thumb"
        role="slider"
        tabIndex={0}
        aria-label={say(which === "start" ? "range.start" : "range.end")}
        aria-orientation="horizontal"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={value}
        aria-valuetext={String(value)}
        style={{ "--p": frac(value), zIndex: top ? 3 : 2 } as React.CSSProperties}
        onKeyDown={(e) => key(which, e)}
      />
    );
  };

  return (
    <div className="yr" role="group" aria-label={say("range.aria")}>
      <span className="yr-v" aria-hidden="true">{from}</span>
      <div ref={track} className="yr-track" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="yr-rail" />
        <span className="yr-fill" style={{ "--a": frac(from), "--b": frac(to) } as React.CSSProperties} />
        {handle("start")}
        {handle("end")}
      </div>
      <span className="yr-v" aria-hidden="true">{to}</span>
      <button type="button" className="yr-reset" disabled={full} onClick={() => onChange(min, max, true)}>{say("range.reset")}</button>
    </div>
  );
}
