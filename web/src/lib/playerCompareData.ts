import "server-only";
import { getBrands, getSummary } from "./data";
import { getPerson, getPlayerRecord } from "./people";
import { buildBoard, careerTitles } from "./playerBoardData";
import type { CompareData } from "./playerCompare";
import { homeLeague } from "./playerLinks";
import { playerPath } from "./playerPath";
import { COACH_AWARDS, getPersonCoaching } from "./personCoaching";
import { getPositions } from "./positionData";
import { positionCodes } from "./positions";

/**
 * What the Compare window needs of one person: the facts, the statistics board's data (without the club logos, which it does not draw) and the position
 * names for its menu. Null when there is no such person; `board` is null for a person with no playing record. Nothing here depends on the language.
 */
export async function comparePlayer(id: number): Promise<CompareData | null> {
  const d = await getPerson(id);
  if (!d) return null;
  const { person: p } = d;
  const [brands, summary, record, coaching, positions, home] = await Promise.all([getBrands(), getSummary(), getPlayerRecord(id), getPersonCoaching(id), getPositions(), homeLeague(p)]);
  const coachCodes = coaching.length ? COACH_AWARDS : new Set<string>();
  const board = await buildBoard({ name: p.name, position: p.position, record, brands, titles: careerTitles(d.teams, record, summary.seasons), awards: d.awards.filter((a) => !coachCodes.has(a.award_code)), held: new Set() });
  const league = home ?? p.leagues?.[0] ?? "";
  return {
    id, name: p.name, path: playerPath(league, id, p.name), home: league,
    facts: { born: p.birth_date, died: p.death_date, place: p.birth_place, country: p.birth_country_code ?? p.nationality_code, heightCm: p.height_cm, hof: p.hall_of_fame_year,
      positions: positionCodes(p.positions, p.position), leagues: p.leagues ?? [], first: p.first_season, last: p.last_season },
    board: board ? { ...board, clubs: {} } : null,
    positions: positions.filter((r) => r.league !== "soccer").map((r) => [r.league, r.code, r.name_en, r.name_fr, r.name_ja]),
  };
}
