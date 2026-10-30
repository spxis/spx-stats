import Link from "@/components/Link";
import type { CSSProperties } from "react";
import { TeamLogo } from "./TeamLogo";
import "./alltime.css";
import "./team.css";

export interface RankItem {
  key: number;
  name: string;
  abbr: string;
  href: string;
  logo: string | null;
  /** Team colour for the light and dark page (hex without #), or null for the league colour. */
  tl: string | null;
  td: string | null;
  value: number;
  text: string;
  tip: string;
  gone?: boolean;
}

export const teamVars = (t: { tl: string | null; td: string | null }): CSSProperties =>
  ({ "--tl": t.tl ? `#${t.tl}` : undefined, "--td": t.td ? `#${t.td}` : undefined }) as CSSProperties;

/** One franchise's bar. With `centre` the bar runs from that value to the right when above it and to the left when below; `span` is the longest distance from it among the bars of the list. */
export function RankRow({ item: i, centre, span }: { item: RankItem; centre?: number; span: number }) {
  const lo = centre ?? 0;
  const d = i.value - lo, pct = (Math.abs(d) / span) * (centre != null ? 50 : 100);
  const bar: CSSProperties = centre != null ? (d >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }) : { left: 0, width: `${pct}%` };
  return (
    <li className="at-c" style={teamVars(i)}>
      <Link className={`rk-name${i.gone ? " rk-gone" : ""}`} href={i.href} prefetch={false} title={i.name}>
        <TeamLogo url={i.logo} size={24} shape="circle" />
        <span className="tn-long">{i.name}</span>
        <abbr className="tn-short" title={i.name}>{i.abbr}</abbr>
      </Link>
      <span className="rk-track" title={i.tip}>
        <i className={`rk-bar${centre != null && d < 0 ? " below" : ""}`} style={bar} />
        {centre != null ? <i className="rk-mid" /> : null}
      </span>
      <b className="rk-val">{i.text}</b>
    </li>
  );
}

/** The longest distance of any bar from the centre (or from nothing): what the other bars are measured against. */
export const rankSpan = (items: readonly RankItem[], centre?: number): number => Math.max(1e-9, ...items.map((i) => Math.abs(i.value - (centre ?? 0))));

/**
 * Franchises ranked by one number, a bar each in the team's colour. With `centre` the bars run from that value (a win
 * share of .500) to the right when above it and to the left when below. Rows past `limit` fold into a "show all" disclosure.
 */
export function RankBars({ items, centre, limit, more, label }: { items: RankItem[]; centre?: number; limit: number; more: string; label: string }) {
  const span = rankSpan(items, centre);
  const row = (i: RankItem) => <RankRow key={i.key} item={i} centre={centre} span={span} />;
  return (
    <>
      <ol className="rank" aria-label={label}>{items.slice(0, limit).map(row)}</ol>
      {items.length > limit ? (
        <details className="rank-more">
          <summary>{more}</summary>
          <ol className="rank" aria-label={label}>{items.slice(limit).map(row)}</ol>
        </details>
      ) : null}
    </>
  );
}
