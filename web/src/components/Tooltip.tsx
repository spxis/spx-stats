"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";

interface TipState { x: number; y: number; body: ReactNode }

/** One tooltip per chart box, placed beside the pointer and kept inside the box. */
export function useTooltip(box: RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<TipState | null>(null);
  const el = useRef<HTMLDivElement | null>(null);

  const show = (ev: MouseEvent, body: ReactNode) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, body });
  };
  const hide = () => setTip(null);

  useLayoutEffect(() => {
    const t = el.current, b = box.current;
    if (!tip || !t || !b) return;
    let x = tip.x + 14, y = tip.y + 14;
    if (x + t.offsetWidth > b.clientWidth) x = tip.x - t.offsetWidth - 14;
    if (y + t.offsetHeight > b.clientHeight + 40) y = tip.y - t.offsetHeight - 10;
    t.style.left = `${Math.max(0, x)}px`;
    t.style.top = `${Math.max(0, y)}px`;
  }, [tip, box]);

  const element = tip ? <div className="tip" ref={el}>{tip.body}</div> : null;
  return { show, hide, element };
}

/** The lines of a tooltip: a bold title, then one line each. */
export function TipLines({ title, lines }: { title: string; lines: (string | null | undefined | false)[] }) {
  return (
    <>
      <b>{title}</b>
      {lines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
    </>
  );
}
