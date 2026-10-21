import Link from "@/components/Link";
import { Badge } from "@/components/ui";
import { SortTable } from "@/components/SortTable";
import type { CupAppearance } from "@/lib/cupRows";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { tableOf } from "@/lib/sort";

/**
 * A club's Stanley Cup series up to 1926 (lib/cupRows.ts), won and lost: the year, the other club, the series and, for a final, each game with its score, the arena and
 * whether the club was at home. The year links to the club's season when it has a page for it (`seasonHref` gives its address, or null).
 */
export async function TeamCup({ appearances, seasonHref, heading, note }: { appearances: CupAppearance[]; seasonHref: (year: number) => string | null; heading?: string; note?: string }) {
  const { say, dt } = await currentSpeaker();
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
      cell: (a) => (a.opponent ? <>{a.opponent}{a.opponentLeague ? <span className="seasoncell"> ({a.opponentLeague})</span> : null}</> : ""),
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
      <div className="scroll"><SortTable {...table} param="sort_cup" /></div>
    </section>
  );
}
