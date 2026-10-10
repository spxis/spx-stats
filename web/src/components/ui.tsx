import Link from "next/link";
import { fmt } from "@/lib/format";
import { isSpx, SRC } from "@/lib/leagues";
import "./team.css";

/** A source's short name in a bordered tag; SPX's own is drawn in the page colour. */
export function Badge({ src }: { src: string | null | undefined }) {
  if (!src) return null;
  return (
    <span className={"badge" + (isSpx(src) ? " spx" : "")} title={src}>
      {SRC[src] || src}
    </span>
  );
}

/**
 * A link to a team's page, or plain text where the franchise is unknown. Inside a season (`year`) it opens that team's
 * season, not the franchise. With `abbr` the name shortens to the abbreviation on a phone (the full name stays on its title).
 */
export function TeamLink({ lg, f, name, className, year, abbr }: {
  lg: string; f: number | null | undefined; name: string | null | undefined; className?: string; year?: number; abbr?: string;
}) {
  const text = abbr ? <><span className="tn-long">{name}</span><abbr className="tn-short" title={name ?? undefined}>{abbr}</abbr></> : name;
  return f != null ? (
    <Link className={className} href={year != null ? `/${lg}/${year}/team/${f}` : `/${lg}/team/${f}`} prefetch={false}>{text}</Link>
  ) : (
    <span className={className}>{text}</span>
  );
}

export function Figures({ items }: { items: [string, number | string][] }) {
  return (
    <section className="figures">
      {items.map(([k, v]) => (
        <div className="figure" key={k}>
          <b>{typeof v === "number" ? fmt(v) : v}</b>
          <span>{k}</span>
        </div>
      ))}
    </section>
  );
}
