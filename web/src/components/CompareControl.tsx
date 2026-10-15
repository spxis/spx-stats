import { CompareMenu } from "@/components/CompareMenu";
import { compareView } from "@/lib/compareView";
import { compareRestPath } from "@/lib/compareMenu";

/**
 * The Compare button of a team page. `year` is the season being viewed (the comparison opens on it); without one (the
 * franchise page) the groups are those of the club's latest season and the comparison opens all-time. The franchise page does not carry the clubs:
 * the menu fetches them from the franchise's `rows/compare` when it is first opened. A season page gives them with the page.
 * The button is an extra: when its data cannot be fetched the page simply goes without it.
 */
export async function CompareControl({ lg, f, name, year, teamPath }: { lg: string; f: number; name: string; year?: number | null; teamPath?: string }) {
  if (year == null && teamPath) return <CompareMenu name={name} dataHref={compareRestPath(teamPath)} />;
  const d = await compareView(lg, f, year).catch(() => null);
  return d ? <CompareMenu name={name} season={d.season} clubs={d.list} labels={d.labels} /> : null;
}
