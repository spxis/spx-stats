import { extent, line, scaleLinear } from "d3";
import "./alltime.css";

/** A franchise's win share season by season, small enough for a table cell; the dashed line is .500. */
export function Spark({ points, label, w = 92, h = 22 }: { points: [number, number][]; label: string; w?: number; h?: number }) {
  if (!points.length) return null;
  const [a = 0, b = 0] = extent(points, (p) => p[0]);
  const x = scaleLinear([a, b === a ? a + 1 : b], [2, w - 3]);
  const y = scaleLinear([0.2, 0.8], [h - 3, 3]).clamp(true);
  const path = line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).defined((p, i) => i === 0 || p[0] - points[i - 1][0] <= 1)(points);
  const end = points[points.length - 1];
  return (
    <span className="spark">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <line className="mid" x1={0} x2={w} y1={y(0.5)} y2={y(0.5)} />
        {points.length > 1 ? <path className="ln" d={path ?? undefined} /> : null}
        <circle className="dot" cx={x(end[0])} cy={y(end[1])} r={2.2} />
      </svg>
    </span>
  );
}
