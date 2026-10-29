import Link from "@/components/Link";
import { TeamLabel } from "@/components/TeamLabel";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { findFinal, parseChampionNote, pairSegment } from "@/lib/series";
import { seasonPath } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";
import { getLeaguePlayoffTeams } from "@/lib/seriesData";
import { guard } from "@/lib/loadGuard";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isVacated, titleGameOf } from "@/lib/postseason";

/**
 * A champion's note ("Won the final 4 games to 3 against Chicago Blackhawks") with the score linked to the
 * series page and the opponent to their team-season page, wherever the playoffs hold that series. A note that
 * does not read that way, or a final the games do not hold, is drawn as plain text.
 */
export const ChampionNote = guard(async function ChampionNote({ lg, year, champ, note, alone }: { lg: string; year: number; champ: number | null | undefined; note: string | null | undefined; alone?: boolean }) {
  const text = note ?? "";
  // College football: the note names the title game ("(game: Orange Bowl)") and says when the NCAA vacated the title.
  const game = lg === "ncaaf" ? titleGameOf(text) : null;
  if (game) {
    const { say } = await currentSpeaker();
    const named = /National Championship/i.test(game);
    return <>{say(named ? "ncaaf.champWon" : "ncaaf.champWonTitle", { game })}{isVacated(text) ? ` ${say("post.vacated")}` : ""}</>;
  }
  const p = parseChampionNote(text);
  if (!p || champ == null) return <>{text}</>;
  const [all, paths, brands] = await Promise.all([getLeaguePlayoffTeams(lg, alone ? year : undefined), getPaths(), getBrands()]);
  const games = all.filter((g) => g.year === year);
  const found = findFinal(games, champ, p.opp);
  if (!found) return <>{text}</>;
  const score = p.score.replace(/\s*-\s*/, "–");
  return (
    <>
      {p.lead}
      <Link href={`${seasonPath(lg, year)}/series/${pairSegment(paths, lg, year, champ, found.opp, found.meeting)}`} prefetch={false} title="The whole series, game by game">{score}</Link>
      {p.mid}
      <TeamLabel lg={lg} f={found.opp} name={p.opp} year={year} logo={logoFor(brands, found.opp, year)} />
    </>
  );
}, ({ note }) => <>{note ?? ""}</>);
