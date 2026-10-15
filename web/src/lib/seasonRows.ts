import type { PackedGames } from "./gamesCodec";
import type { ClubTeam } from "./season";

/** A season's games and clubs as the browser fetches them (lib/seasonGamesData.ts makes them; components/SeasonGamesData.tsx reads them). No server code. */
export interface SeasonGamesView { games: PackedGames; teams: ClubTeam[] }

/** The address of a season's games and clubs, from the season page's address (`/mlb/2025`). */
export const seasonGamesPath = (seasonPath: string): string => `${seasonPath}/rows/games`;
/** The address of what the season's path-to-the-title diagram draws. */
export const seasonPathDataPath = (seasonPath: string): string => `${seasonPath}/rows/path`;
