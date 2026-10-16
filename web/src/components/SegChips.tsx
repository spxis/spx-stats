import Link from "@/components/Link";
import "./alignment.css";

/** One chip of the players list's league row (All / NHL / NBA / …). People uses the same module for leagues, sports and club-seasons. */
export interface SegChip {
  code: string;
  short: string;
}

/**
 * The segmented chip row `/players` draws for leagues. Same CSS (alignment.css `.seg.views`), same Link, same aria-current.
 * `href(code)` is the address with that chip chosen; empty code is "All" and should drop the query key.
 */
export function SegChips({ aria, current, items, href }: {
  aria: string;
  current: string;
  items: readonly SegChip[];
  href: (code: string) => string;
}) {
  return (
    <nav className="seg views" aria-label={aria}>
      {items.map((item) => (
        <Link key={item.code || "all"} href={href(item.code)} prefetch={false} aria-current={item.code === current ? "page" : undefined}>{item.short}</Link>
      ))}
    </nav>
  );
}
