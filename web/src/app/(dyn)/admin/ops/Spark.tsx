import { sparkline } from "@/lib/ops/rules";

/**
 * A small line chart of one series of the day's snapshots (oldest left). Server-drawn SVG in the page's own ink colour, with the caption as its
 * accessible name; with fewer than two points it says so instead of drawing a line.
 */
export function Spark({ values, caption, empty, last }: { values: (number | null)[]; caption: string; empty: string; last: string }) {
  const s = sparkline(values, 200, 40);
  return (
    <figure className="ops-spark">
      {s ? (
        <svg viewBox="0 0 200 40" role="img" aria-label={`${caption}: ${last}`} preserveAspectRatio="none">
          <line x1="0" y1="38" x2="200" y2="38" className="ops-spark-base" />
          <polyline points={s.points} className="ops-spark-line" />
        </svg>
      ) : (
        <p className="note">{empty}</p>
      )}
      <figcaption className="note">{caption}{s ? ` · ${last}` : ""}</figcaption>
    </figure>
  );
}
