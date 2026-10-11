import { area, extent, line, scaleLinear } from "d3";
import "./leaders.css";

export interface SparkPoint { year: number; value: number }

const W = 200, H = 46, PAD = 5;

/** A small picture of a stat's leading value season by season, the shown season marked. Drawn on the server: no script. */
export function LeaderSpark({ points, year }: { points: SparkPoint[]; year: number }) {
  if (points.length < 2) return null;
  const [x0 = 0, x1 = 0] = extent(points, (p) => p.year);
  const [v0 = 0, v1 = 0] = extent(points, (p) => p.value);
  const x = scaleLinear([x0, x1], [PAD, W - PAD]);
  const y = scaleLinear([v0, v1 === v0 ? v0 + 1 : v1], [H - PAD, PAD]);
  const joined = (p: SparkPoint, i: number) => i === 0 || p.year - points[i - 1].year <= 1;
  const path = line<SparkPoint>().defined(joined).x((p) => x(p.year)).y((p) => y(p.value))(points);
  const fill = area<SparkPoint>().defined(joined).x((p) => x(p.year)).y0(H - PAD).y1((p) => y(p.value))(points);
  const here = points.find((p) => p.year === year);
  return (
    <svg className="lspark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <path className="sarea" d={fill ?? undefined} />
      <path className="sline" d={path ?? undefined} />
      {here ? (
        <>
          <line className="sguide" x1={x(here.year)} x2={x(here.year)} y1={PAD} y2={H - PAD} />
          <circle className="sdot" cx={x(here.year)} cy={y(here.value)} r={4} />
        </>
      ) : null}
    </svg>
  );
}
