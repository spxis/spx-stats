import { positionBook } from "@/components/PositionKey";
import { getRoster } from "@/lib/roster";

/**
 * The key to the position codes of a club's season roster, drawn at the bottom of the team season page (the roster section sits higher up, so
 * the page cannot collect its codes itself). It reads the same cached roster the roster section reads, so it costs no further read.
 */
export async function TeamPositionsKey({ lg, teamSeasonId }: { lg: string; teamSeasonId: number }) {
  const roster = await getRoster(teamSeasonId);
  if (!roster.length) return null;
  const book = await positionBook();
  for (const p of roster) book.note(p.positions, null, [lg]);
  return book.key();
}
