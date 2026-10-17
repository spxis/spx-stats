"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { grabAt, PAN_GRIP_MOUSE, PAN_GRIP_TOUCH, panByPixels, panRange, rangePresets, type RangePreset } from "@/lib/yearRange";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./yearrange.css";

interface Props {
  min: number;
  max: number;
  from: number;
  to: number;
  /** `final` is false while a handle is being dragged (at most once per frame) and true when the change is settled. */
  onChange: (from: number, to: number, final: boolean) => void;
  /** The one-tap ranges to offer instead of the site's usual ones (a player's page: all, last 10, peak 5). */
  presets?: RangePreset[];
  /** Extra control beside Reset (the archive chart's Grow / Collapse). */
  extra?: ReactNode;
}

const PAD = 16; // half of a handle's hit area, in px: keeps the handles inside the track at both ends

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Two handles on one line that narrow a chart to the years from..to. A handle never crosses the other; one season is the least.
    The bar between the handles moves the whole range, its width unchanged, and stops at the first and last season. */
export function YearRange({ min, max, from, to, onChange, presets, extra }: Props) {
  const { say } = useSpeaker();
  const track = useRef<HTMLDivElement | null>(null);
  const thumbs = useRef<{ start: HTMLDivElement | null; end: HTMLDivElement | null; pan: HTMLDivElement | null }>({ start: null, end: null, pan: null });
  const live = useRef({ from, to });
  const drag = useRef<"start" | "end" | "pan" | null>(null);
  const grip = useRef({ x: 0, from, to, moved: false }); // where a bar drag began: the pointer's x and the range it moved from
  const [panning, setPanning] = useState(false);
  const raf = useRef(0);
  const full = from <= min && to >= max;
  useEffect(() => { if (!drag.current && !raf.current) live.current = { from, to }; }, [from, to]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const frac = (y: number) => (max > min ? (y - min) / (max - min) : 0);

  function set(which: "start" | "end", value: number, final: boolean) {
    const cur = live.current;
    commit(which === "start" ? { from: clamp(value, min, cur.to), to: cur.to } : { from: cur.from, to: clamp(value, cur.from, max) }, final);
  }

  /** Takes the new range as the live one and passes it on: at most once a frame while dragging, at once when settled. */
  function commit(next: { from: number; to: number }, final: boolean) {
    const cur = live.current;
    if (next.from === cur.from && next.to === cur.to && !final) return;
    live.current = next;
    if (final) { cancelAnimationFrame(raf.current); raf.current = 0; onChange(next.from, next.to, true); return; }
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; onChange(live.current.from, live.current.to, false); });
  }

  /** The line the handles run along: its left edge and width in px. */
  function line() {
    const r = track.current!.getBoundingClientRect();
    return { left: r.left + PAD, width: Math.max(1, r.width - 2 * PAD) };
  }

  function yearAt(clientX: number): number {
    const l = line();
    return clamp(Math.round(min + ((clientX - l.left) / l.width) * (max - min)), min, max);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const { from: f, to: t } = live.current, l = line();
    const which = grabAt(e.clientX, l.left + frac(f) * l.width, l.left + frac(t) * l.width, e.pointerType === "mouse" ? PAN_GRIP_MOUSE : PAN_GRIP_TOUCH);
    drag.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (which === "pan") {
      grip.current = { x: e.clientX, from: f, to: t, moved: false };
      thumbs.current.pan?.focus({ preventScroll: true });
      setPanning(true);
      return;
    }
    thumbs.current[which]?.focus({ preventScroll: true });
    set(which, yearAt(e.clientX), false);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (drag.current === "pan") {
      const g = grip.current, next = panByPixels(g, e.clientX - g.x, line().width, min, max);
      if (next.from !== g.from) g.moved = true;
      commit(next, false);
    } else if (drag.current) set(drag.current, yearAt(e.clientX), false);
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const which = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (which === "pan") {
      setPanning(false);
      const cancelled = e.type === "pointercancel";
      if (cancelled) commit({ from: grip.current.from, to: grip.current.to }, false); // a cancelled drag puts the range back
      if (grip.current.moved || cancelled) commit(live.current, true);
      return;
    }
    set(which, which === "start" ? live.current.from : live.current.to, true);
  }

  function panKey(e: KeyboardEvent<HTMLDivElement>) {
    const { from: f, to: t } = live.current, span = { from: f, to: t };
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    let next: { from: number; to: number } | undefined;
    if (e.key in step) next = panRange(span, step[e.key], min, max);
    else if (e.key === "Home") next = panRange(span, min - f, min, max);
    else if (e.key === "End") next = panRange(span, max - t, min, max);
    if (!next) return;
    e.preventDefault();
    commit(next, true);
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

  const labelOf = (p: RangePreset) =>
    p.id === "all" ? say("range.all") : p.id === "last10" ? say("range.last10") : p.id === "peak" ? say("range.peak") : p.id === "spx" ? say("range.spx") : say("range.since", { year: p.year ?? p.from });

  return (
    <div className="yr-wrap" role="group" aria-label={say("range.aria")}>
    <div className="yr">
      <span className="yr-v" aria-hidden="true">{from}</span>
      <div ref={track} className="yr-track" data-panning={panning || undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="yr-rail" />
        <span className="yr-fill" style={{ "--a": frac(from), "--b": frac(to) } as React.CSSProperties} />
        {handle("start")}
        <div
          ref={(el) => { thumbs.current.pan = el; }}
          className="yr-pan"
          role="slider"
          tabIndex={0}
          aria-label={say("range.move")}
          aria-orientation="horizontal"
          aria-valuemin={min}
          aria-valuemax={Math.max(min, max - (to - from))}
          aria-valuenow={from}
          aria-valuetext={`${from}–${to}`}
          style={{ "--a": frac(from), "--b": frac(to) } as React.CSSProperties}
          onKeyDown={panKey}
        />
        {handle("end")}
      </div>
      <span className="yr-v" aria-hidden="true">{to}</span>
    </div>
    <div className="yr-presets" role="group" aria-label={say("range.presets")}>
      {(presets ?? rangePresets(min, max)).map((p) => (
        <button key={`${p.from}-${p.to}`} type="button" className="yr-preset" aria-pressed={from === p.from && to === p.to} onClick={() => onChange(p.from, p.to, true)}>{labelOf(p)}</button>
      ))}
    </div>
    <div className="yr-end">
      {extra}
      <button type="button" className="yr-reset" disabled={full} onClick={() => onChange(min, max, true)}>{say("range.reset")}</button>
    </div>
    </div>
  );
}
