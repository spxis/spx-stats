import Link from "next/link";
import { TeamLogo } from "@/components/TeamLogo";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { findFinal, parseChampionNote, pairSegment } from "@/lib/series";
import { seasonPath } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";
import { getLeaguePlayoffTeams } from "@/lib/seriesData";

/**
 * A champion's note ("Won the final 4 games to 3 against Chicago Blackhawks") with the score linked to the
 * series page and the opponent to their team-season page, wherever the playoffs hold that series. A note that
 * does not read that way, or a final the games do not hold, is drawn as plain text.
 */
export async function ChampionNote({ lg, year, champ, note }: { lg: string; year: number; champ: number | null | undefined; note: string | null | undefined }) {
  const text = note ?? "";
  const p = parseChampionNote(text);
  if (!p || champ == null) return <>{text}</>;
  const [all, paths, brands] = await Promise.all([getLeaguePlayoffTeams(lg), getPaths(), getBrands()]);
  const games = all.filter((g) => g.year === year);
  const found = findFinal(games, champ, p.opp);
  if (!found) return <>{text}</>;
  const score = p.score.replace(/\s*-\s*/, "–");
  return (
    <>
      {p.lead}
      <Link href={`${seasonPath(lg, year)}/series/${pairSegment(paths, lg, year, champ, found.opp, found.meeting)}`} prefetch={false} title="The whole series, game by game">{score}</Link>
      {p.mid}
      <TeamLogo url={logoFor(brands, found.opp, year)} />
      <Link href={paths.teamSeason(lg, found.opp, year)} prefetch={false}>{p.opp}</Link>
    </>
  );
}
