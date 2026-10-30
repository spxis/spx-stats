import Link from "@/components/Link";
import { Badge } from "@/components/ui";
import { TeamData } from "@/components/TeamData";
import { TeamLabel } from "@/components/TeamLabel";
import { SortTable } from "@/components/SortTable";
import type { CupAppearance } from "@/lib/cupRows";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { tableOf } from "@/lib/sort";
import { getSlugs } from "@/lib/teamSlugs";

/**
 * A club's Stanley Cup series up to 1926 (lib/cupRows.ts), won and lost: the year, the other club, the series and, for a final, each game with its score, the arena and
 * whether the club was at home. The year links to the club's season when it has a page for it (`seasonHref` gives its address, or null).
 */
export async function TeamCup({ appearances, seasonHref, heading, note }: { appearances: CupAppearance[]; seasonHref: (year: number) => string | null; heading?: string; note?: string }) {
  const [{ say, dt }, slugs, brands] = await Promise.all([currentSpeaker(), getSlugs().catch(() => null), getBrands()]);
  // An opponent core holds as a franchise is named like any team (logo and link) in the league whose pages it has, the NHL's first; the others are clubs of the table alone.
  const homeLeague = (f: number): string | undefined => ["nhl", ...Object.keys(slugs?.leagues ?? {})].find((l) => slugs?.leagues[l]?.entries[f]);
  const opponentLeagues = [...new Set(appearances.flatMap((a) => (a.opponentFranchise != null ? [homeLeague(a.opponentFranchise) ?? []] : [])).flat())];
  const table = tableOf([...appearances].reverse(), [
    {
      key: "year", label: say("col.season"), cls: "seasoncell", get: (a) => a.year,
      cell: (a) => {
        const href = seasonHref(a.year);
        return href ? <Link href={href} prefetch={false}>{a.year}</Link> : a.year;
      },
    },
    {
      key: "result", label: say("col.result"), get: (a) => a.result,
      cell: (a) => (a.opponent == null ? say("team.cupNoChallenger") : say(a.result === "won" ? "team.cupWon" : a.result === "lost" ? "team.cupLost" : "team.cupNone")),
    },
    {
      key: "against", label: say("col.opponent"), cls: "team", get: (a) => a.opponent,
      cell: (a) => (a.opponent ? <>{a.opponentFranchise != null && homeLeague(a.opponentFranchise) ? <TeamLabel lg={homeLeague(a.opponentFranchise)!} f={a.opponentFranchise} name={a.opponent} logo={logoFor(brands, a.opponentFranchise, a.year)} /> : a.opponent}{a.opponentLeague ? <span className="seasoncell"> ({a.opponentLeague})</span> : null}</> : ""),
    },
    { key: "score", label: say("team.cupSeries"), cls: "seasoncell", get: (a) => a.score, cell: (a) => a.score ?? "" },
    {
      key: "games", label: say("team.cupGames"), cls: "seasoncell", get: () => null,
      cell: (a) => {
        if (!a.games.length) return "";
        const venues = [...new Set(a.games.map((g) => g.venue).filter(Boolean))];
        return (
          <>
            {a.games.map((g, i) => (
              <span key={g.no}>
                {i ? ", " : ""}{g.date ? `${dt.monthDayShort(atUtc(g.date))} ` : ""}{g.mine ?? "–"}–{g.theirs ?? "–"}{g.overtimes ? ` ${say("game.ot")}` : ""}{g.home === false ? ` ${say("team.cupAway")}` : ""}
              </span>
            ))}
            {venues.length ? <span className="note"> · {venues.join(", ")}</span> : null}
          </>
        );
      },
    },
  ], (a, i) => `${a.year}|${i}`);
  return (
    <section className="section" id="cup">
      <h2>{heading ?? say("team.cupTitle")}</h2>
      <p className="note">{note ?? say("team.cupNote")} <Badge src="wikipedia" /></p>
      <TeamData leagues={opponentLeagues}><div className="scroll"><SortTable {...table} param="sort_cup" /></div></TeamData>
    </section>
  );
}
