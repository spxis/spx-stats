import Link from "@/components/Link";
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
 * and crawlable. The whole-league view is the default and leaves the address plain. On the same row, the groups of the chosen view
 * (the conferences, or the divisions) are buttons that narrow the table to one of them (?group=); hovering or focusing one lights its clubs in the table (components/StandingsFocus.tsx).
 */
export async function ViewTabs({ lg, path, sp, view, views, rows, choices = [], group = "" }: { lg: string; path: string; sp: Query; view: ViewId; views: ViewId[]; rows: readonly Placed[]; choices?: { key: string; label: string; cls: string }[]; group?: string }) {
  if (views.length < 2) return null;
  const { say } = await currentSpeaker();
  return (
    <div className="viewrow">
      <nav className="seg views" aria-label={say("view.aria")}>
        {views.map((v) => (
          <Link key={v} href={queryHref(path, sp, { view: v === "league" ? null : v, group: null })} prefetch={false} scroll={false}
            aria-current={v === view ? "page" : undefined} data-hicol={v === "league" ? undefined : v}>{viewLabel(say, lg, v, rows)}</Link>
        ))}
      </nav>
      {choices.length ? (
        <nav className="seg views sub" aria-label={say("view.subAria")}>
          {[{ key: "", label: say("view.subAll"), cls: "" }, ...choices].map((c) => (
            <Link key={c.key} href={queryHref(path, sp, { group: c.key || null })} prefetch={false} scroll={false}
              aria-current={c.key === group ? "page" : undefined} data-hi={c.cls}>{c.label}</Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
