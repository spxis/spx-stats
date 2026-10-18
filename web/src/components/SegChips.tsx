import Link from "@/components/Link";
import "./alignment.css";

/** One chip of the players list's league row (All / NHL / NBA / …). People uses the same module for leagues, sports and club-seasons. */
export interface SegChip {
  code: string;
  short: string;
  title?: string;
  /** A count shown after the label, already formatted. */
  n?: string;
}

/**
 * The segmented chip row `/players` draws for leagues. Same CSS (alignment.css `.seg.views`), same Link, same aria-current.
 * Chips wrap at `--control-h` (A–Z, `.seg.views.sub`): a long sport row never scrolls the page sideways.
 * `href(code)` is the address with that chip chosen; empty code is "All" and should drop the query key.
 */
export function SegChips({ aria, current, items, href }: {
  aria: string;
  current: string;
  items: readonly SegChip[];
  href: (code: string) => string;
}) {
  return (
    <nav className="seg views wrap" aria-label={aria}>
      {items.map((item) => (
        <Link key={item.code || "all"} href={href(item.code)} prefetch={false} title={item.title} aria-current={item.code === current ? "page" : undefined}>{item.short}{item.n ? <span className="chipn">{item.n}</span> : null}</Link>
      ))}
    </nav>
  );
}
