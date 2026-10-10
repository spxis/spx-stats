import Link from "next/link";
import { fmt } from "@/lib/format";
import { isSpx, SRC } from "@/lib/leagues";

/** A source's short name in a bordered tag; SPX's own is drawn in the page colour. */
export function Badge({ src }: { src: string | null | undefined }) {
  if (!src) return null;
  return (
    <span className={"badge" + (isSpx(src) ? " spx" : "")} title={src}>
      {SRC[src] || src}
    </span>
  );
}

/** A link to a team's page, or plain text where the franchise is unknown. */
export function TeamLink({ lg, f, name, className }: { lg: string; f: number | null | undefined; name: string | null | undefined; className?: string }) {
  return f != null ? (
    <Link className={className} href={`/${lg}/team/${f}`} prefetch={false}>{name}</Link>
  ) : (
    <span className={className}>{name}</span>
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
