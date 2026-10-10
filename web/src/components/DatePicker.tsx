"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { atUtc, utc } from "@/lib/format";
import "./datepicker.css";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const addDays = (iso: string, n: number): string => { const d = atUtc(iso); d.setUTCDate(d.getUTCDate() + n); return utc.iso(d); };
const addMonths = (iso: string, n: number): string => {
  const d = atUtc(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return utc.iso(d);
};
const clamp = (iso: string, min: string, max: string): string => (iso < min ? min : iso > max ? max : iso);

interface Props {
  /** Names the button for a screen reader and is the dialog's name: "Standings date". */
  label: string;
  /** The chosen day (YYYY-MM-DD), or "" for none. */
  value: string;
  /** The first and last day that can be chosen; days outside are shown and disabled. */
  min: string;
  max: string;
  /** Days to mark with a dot (the days with games). */
  marked?: ReadonlySet<string>;
  onChange: (iso: string) => void;
  /** What the button says when nothing is chosen. */
  placeholder?: string;
  /** The pop-up hangs from the button's right edge instead of its left. */
  alignEnd?: boolean;
  /** What a day with a mark is called to a screen reader ("games played"). */
  markedWord?: string;
}

/**
 * The site's one date picker: a button that opens a small month calendar. Days outside min..max are disabled, days in
 * `marked` carry a dot. Arrow keys move a day (up and down a week), Page Up and Page Down a month (with Shift, a year),
 * Home and End to the start and end of the week, Enter or Space chooses; Escape closes it and returns to the button, and
 * so does a press anywhere outside. On a phone the pop-up is a sheet along the foot of the screen.
 */
export function DatePicker({ label, value, min, max, marked, onChange, placeholder = "Pick a date", alignEnd = false, markedWord = "games played" }: Props) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const month = focus.slice(0, 7);

  const show = useCallback(() => { setFocus(clamp(value || max, min, max)); setOpen(true); }, [value, min, max]);
  const close = useCallback((back: boolean) => { setOpen(false); if (back) trigger.current?.focus(); }, []);

  // A press outside the picker closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the pop-up inside the window: slide it left or right by what overflows (a phone's button sits mid-screen).
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    el.style.transform = "";
    const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, gap = 16;
    const dx = r.right > vw - gap ? vw - gap - r.right : r.left < gap ? gap - r.left : 0;
    if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`;
  }, [open, month]);

  // Keep the keyboard focus on the day that is current.
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLButtonElement>(`button[data-day="${focus}"]`)?.focus();
  }, [open, focus]);

  const move = (to: string) => setFocus(clamp(to, min, max));
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    const d = atUtc(focus), wd = d.getUTCDay();
    const to: string | null =
      e.key === "ArrowLeft" ? addDays(focus, -1) : e.key === "ArrowRight" ? addDays(focus, 1)
      : e.key === "ArrowUp" ? addDays(focus, -7) : e.key === "ArrowDown" ? addDays(focus, 7)
      : e.key === "PageUp" ? addMonths(focus, e.shiftKey ? -12 : -1) : e.key === "PageDown" ? addMonths(focus, e.shiftKey ? 12 : 1)
      : e.key === "Home" ? addDays(focus, -wd) : e.key === "End" ? addDays(focus, 6 - wd) : null;
    if (to) { e.preventDefault(); move(to); }
  }

  const days = useMemo(() => {
    if (!month) return [];
    const first = atUtc(`${month}-01`);
    const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
    for (const d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) cells.push(utc.iso(d));
    return cells;
  }, [month]);

  const firstOfMonth = `${month}-01`;
  const canPrev = !!month && addDays(firstOfMonth, -1) >= min;
  const canNext = !!month && addMonths(firstOfMonth, 1) <= max;
  const text = value ? utc.short(atUtc(value)) : placeholder;

  return (
    <div className="dp" ref={root}>
      <button ref={trigger} type="button" className="dp-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        aria-label={value ? `${label}: ${utc.full(atUtc(value))}` : label} onClick={() => (open ? close(false) : show())}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <rect x="2" y="3" width="12" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
        <span>{text}</span>
      </button>
      {open ? (
        <div id={id} ref={pop} className={"dp-pop" + (alignEnd ? " end" : "")} role="dialog" aria-label={label} onKeyDown={onKey}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" disabled={!canPrev} onClick={() => move(addMonths(focus, -1))}>‹</button>
            <span className="dp-month" aria-live="polite">{utc.monthYear(atUtc(firstOfMonth))}</span>
            <button type="button" className="dp-nav" aria-label="Next month" disabled={!canNext} onClick={() => move(addMonths(focus, 1))}>›</button>
          </div>
          <div className="dp-grid" role="grid" aria-label={utc.monthYear(atUtc(firstOfMonth))}>
            <div className="dp-row" role="row">
              {WEEKDAYS.map((w, i) => <span key={i} className="dp-wd" role="columnheader" aria-label={WEEKDAY_NAMES[i]}>{w}</span>)}
            </div>
            {Array.from({ length: Math.ceil(days.length / 7) }, (_, r) => (
              <div className="dp-row" role="row" key={r}>
                {days.slice(r * 7, r * 7 + 7).map((d, i) => {
                  if (!d) return <span key={i} className="dp-blank" role="gridcell" />;
                  const off = d < min || d > max, mk = marked?.has(d) ?? false;
                  return (
                    <span key={d} role="gridcell" aria-selected={d === value}>
                      <button type="button" data-day={d} className={"dp-day" + (d === value ? " on" : "") + (mk ? " mk" : "")}
                        disabled={off} tabIndex={d === focus ? 0 : -1}
                        aria-label={`${utc.full(atUtc(d))}${mk ? `, ${markedWord}` : ""}`}
                        onClick={() => { onChange(d); close(true); }}>
                        {Number(d.slice(8))}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="dp-foot">
            <span className="dp-key"><i aria-hidden="true" />{markedWord}</span>
            {value ? <button type="button" className="dp-clear" onClick={() => { onChange(""); close(true); }}>Clear</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
