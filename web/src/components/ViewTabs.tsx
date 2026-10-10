import Link from "next/link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { viewLabel, type Placed, type ViewId } from "@/lib/alignment";
import "./alignment.css";

type Query = Record<string, string | string[] | undefined>;

/** The query of the current request with some keys replaced (null drops one), as a href on `path`. */
export function queryHref(path: string, sp: Query, changes: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...changes })) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") q.set(k, val);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * League / Conference / Division (/ Wild card) as a row of links: the choice is in the address (?view=), so it is shared
 * and crawlable. The whole-league view is the default and leaves the address plain.
 */
export async function ViewTabs({ lg, path, sp, view, views, rows }: { lg: string; path: string; sp: Query; view: ViewId; views: ViewId[]; rows: readonly Placed[] }) {
  if (views.length < 2) return null;
  const { say } = await currentSpeaker();
  return (
    <nav className="seg views" aria-label={say("view.aria")}>
      {views.map((v) => (
        <Link key={v} href={queryHref(path, sp, { view: v === "league" ? null : v })} prefetch={false} scroll={false}
          aria-current={v === view ? "page" : undefined}>{viewLabel(say, lg, v, rows)}</Link>
      ))}
    </nav>
  );
}
