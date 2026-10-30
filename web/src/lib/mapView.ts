import type { Pin } from "@/components/mapDraw";
import type { VenueTeam } from "./venueMap";

/** What a franchise page's two maps draw besides the club's own pin (see lib/franchiseMap.ts), and where to fetch it from. */
export interface FranchiseMapView {
  /** Where every club of the club's latest season plays; null when the club has no place on record. */
  league: Pin[] | null;
  clubCount: number;
  seasonLabel: string;
  leagueShort: string;
}

export const mapRestPath = (teamPath: string): string => `${teamPath}/rows/map`;

/** Where the league's venue list is fetched from (`/nhl/rows/venues`), given a franchise's address (`/nhl/team/montreal-canadiens`). */
export const venuesRestPath = (teamPath: string): string => `${teamPath.replace(/\/team\/[^/]*$/, "")}/rows/venues`;
export interface LeagueVenues { teams: VenueTeam[] }
