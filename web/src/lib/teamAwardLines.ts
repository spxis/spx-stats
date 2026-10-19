import "server-only";
import type { AwardLine, AwardList } from "./awardLines";
import { logoFor } from "./brand";
import { getBrands } from "./data";
import { getTeamAwards } from "./people";
import { getPlayerPaths } from "./playerLinks";
import { championshipName } from "./trophies";

/** The awards a franchise and its players won, newest first, as plain data (lib/awardLines.ts); null when they could not be read, an empty list when there are none. */
export async function teamAwardLines(lg: string, f: number): Promise<AwardList | null> {
  const [list, player, brands] = await Promise.all([getTeamAwards(lg, f), getPlayerPaths(), getBrands()]);
  if (!list) return null;
  const logos: string[] = [];
  const lines = list.map((r): AwardLine => {
    const l: AwardLine = { y: r.year, a: r.kind === "championship" ? championshipName(lg, r.year, r.award) : r.award, c: r.award_code };
    if (r.winner) l.w = r.winner;
    if (r.person_id != null) l.h = player(r.person_id, r.winner ?? "", lg);
    else {
      const logo = logoFor(brands, f, r.year);
      if (logo) { let i = logos.indexOf(logo); if (i < 0) i = logos.push(logo) - 1; l.lo = i; }
    }
    if (r.kind === "person_award") l.p = 1;
    return l;
  });
  return { lines, logos };
}
