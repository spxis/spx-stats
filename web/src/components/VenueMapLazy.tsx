"use client";

import { Credits } from "./Credits";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";
import { VenueMap, type VenueTab } from "./VenueMap";
import { mapRestPath, type FranchiseMapView } from "@/lib/mapView";

/**
 * The map under HOME VENUES on a franchise's page, fetched when the reader gets near it: it needs every club's venues (a hundred clubs, their addresses
 * and logos), which were over 40 KB of the page's payload and again as the map's props. The data is one kept JSON answer per franchise
 * (the route `rows/map`, shared with the map in the page's corner). Until it comes the section shows the credit its addresses need.
 */
export function VenueMapLazy({ teamPath, slug, tab, team }: { teamPath: string; slug: string; tab: VenueTab; team: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { state, data } = useFetchedJson<FranchiseMapView>(mapRestPath(teamPath), "view", seen);
  if (data?.teams.length) {
    return <VenueMap league={data.league} teams={data.teams} slug={slug} leagueShort={data.leagueShort} seasonLabel={data.seasonLabel} clubCount={data.clubCount} tab={tab} team={team} />;
  }
  return (
    <div ref={ref} style={{ minHeight: state === "failed" || data ? undefined : 520 }}>
      <p className="note"><Credits say={say} use={["addresses"]} /></p>
    </div>
  );
}
