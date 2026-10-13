/**
 * Cache tags for the fetches in client.ts, so the release runner can refresh just the pages a release touched
 * (POST /api/revalidate, scripts/release/release.py revalidate_tags). Every request carries:
 *   api                      everything read from the archive
 *   api:<view>               one api view
 *   api:<view>:<league>      the view for the league the query asks for (league=eq.nhl), or api:<view>:all when it names none
 * A release that changed only some leagues refreshes api:<view>:<league> and api:<view>:all for those; one that cannot say
 * which refreshes api:<view>.
 */
const LEAGUE = /(?:^|&)league=eq\.([A-Za-z]+)(?:&|$)/;

export function tagsFor(view: string, query: string): string[] {
  const league = LEAGUE.exec(query)?.[1]?.toLowerCase() ?? "all";
  return ["api", `api:${view}`, `api:${view}:${league}`];
}
