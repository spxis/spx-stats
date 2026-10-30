import { CompareMenu } from "@/components/CompareMenu";
import { compareView } from "@/lib/compareView";
import { compareRestPath } from "@/lib/compareMenu";

/**
 * The Compare button of a team page. `year` is the season being viewed (the comparison opens on it); without one (the
 * franchise page) the groups are those of the club's latest season and the comparison opens all-time. Neither page carries the clubs:
 * the menu fetches them from the `rows/compare` of the franchise (or of the club's season, given its address) when it is first opened.
 * The button is an extra: when its data cannot be fetched the page simply goes without it.
 */
export async function CompareControl({ lg, f, name, year, teamPath }: { lg: string; f: number; name: string; year?: number | null; teamPath?: string }) {
  if (teamPath) return <CompareMenu name={name} dataHref={compareRestPath(teamPath)} />;
  const d = await compareView(lg, f, year).catch(() => null);
  return d ? <CompareMenu name={name} season={d.season} clubs={d.list} labels={d.labels} /> : null;
}
