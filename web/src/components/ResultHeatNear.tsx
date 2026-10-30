"use client";

import { ResultHeat } from "./ResultHeat";
import { useSeen } from "./useSeen";

/**
 * A results graph drawn when the reader gets near it. Its games are in the page already (a season's graph is a hundred-odd small squares, about 30 KB
 * of markup), so nothing is fetched: only the drawing waits, and the page keeps a box of the graph's height until then.
 */
export function ResultHeatNear(props: Parameters<typeof ResultHeat>[0]) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return seen ? <ResultHeat {...props} /> : <div ref={ref} className="rheat-lazy" style={{ minHeight: 160 }} />;
}
