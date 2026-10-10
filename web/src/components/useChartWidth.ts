"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** The width of a chart's box, kept current as the window changes (the charts redraw to fit, text staying 1:1 in pixels). */
export function useChartWidth(initial: number, min: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setWidth(Math.max(Math.round(el.clientWidth), min));
    measure();
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(measure, 100); });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [min]);
  return [ref, width];
}
