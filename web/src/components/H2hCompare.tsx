import "./series.css";

export interface H2hMetric { label: string; a: number | null; b: number | null; text: (v: number) => string; low?: boolean; ta?: string | null; tb?: string | null }

/** The two clubs' figures as one row of paired bars, the better one in full colour (--ca and --cb come from SeriesStyle). */
export function H2hCompareRow({ m }: { m: H2hMetric }) {
  const top = Math.max(m.a ?? 0, m.b ?? 0) || 1;
  const better = m.a == null || m.b == null || m.a === m.b ? null : (m.a > m.b) !== !!m.low ? 0 : 1;
  const half = (i: 0 | 1, v: number | null, t: string | null | undefined) => (
    <span className={`half ${i === 0 ? "a" : "b"}${better === i ? " best" : ""}`}>
      <span className="val">{v != null ? m.text(v) : "—"}{t ? <small>{t}</small> : null}</span>
      <span className="track"><i style={{ width: `${v != null ? Math.max(3, (100 * v) / top) : 0}%`, background: i === 0 ? "var(--ca)" : "var(--cb)" }} /></span>
    </span>
  );
  return (
    <div className="cmprow">
      {half(0, m.a, m.ta)}
      <span className="lab">{m.label}</span>
      {half(1, m.b, m.tb)}
    </div>
  );
}
