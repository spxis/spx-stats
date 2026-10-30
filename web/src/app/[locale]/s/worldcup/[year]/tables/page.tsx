import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { SoccerCredit } from "@/components/SoccerCredit";
import { WcMatchesTable, WcScorersTable, WcTeamsTable } from "@/components/WcTables";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getTopScorers, getTournamentMatches, getTournamentTeams, tournamentOfYear } from "@/lib/soccer";
import { isYearSeg, tournamentPath } from "@/lib/soccerPath";
import { buildWcMatches, buildWcScorers, buildWcTeams, wcTablesPath } from "@/lib/wcLines";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Every team, match and top scorer of a tournament on a page of its own: the "Show all" of the tournament page is a link here where script is off. Drawn on its first visit, then kept.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/worldcup/[year]/tables">;

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { year } = await params;
  if (!isYearSeg(year)) return {};
  const t = await tournamentOfYear(Number(year));
  if (!t) return {};
  const { say, locale } = await currentSpeaker();
  const title = say(t.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: t.year });
  return pageMeta({ title: `${title}: ${say("wc.t.matches")}`, description: say("wc.t.metaDesc", { title, champion: t.winner ?? "", matches: t.matches, goals: t.goals }), path: wcTablesPath(t.year), locale });
});

export default guard(async function TournamentTablesPage({ params }: Params) {
  const { year } = await params;
  if (!isYearSeg(year)) notFound();
  const t = await tournamentOfYear(Number(year));
  if (!t) notFound();
  const { say } = await currentSpeaker();
  const [teams, matches, scorers] = await Promise.all([getTournamentTeams(t.tournament_id), getTournamentMatches(t.tournament_id), getTopScorers(t.tournament_id)]);
  const title = say(t.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: t.year });
  const here = wcTablesPath(t.year);
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say(t.league === "wwc" ? "wc.womens" : "wc.mens")}</span>
        <h1>{title}</h1>
        <p className="note"><Link href={tournamentPath(t.year)}>{title}</Link></p>
      </section>
      {teams.length ? (
        <section className="section scroll" id="teams">
          <h2>{say("wc.t.teams")}</h2>
          <WcTeamsTable lines={buildWcTeams(teams)} full hrefAll={here} />
        </section>
      ) : null}
      {matches.length ? (
        <section className="section scroll" id="matches">
          <h2>{say("wc.t.matches")}</h2>
          <WcMatchesTable year={t.year} wire={buildWcMatches(matches)} full hrefAll={here} />
          {matches.some((m) => m.lineup_players === 0) ? <p className="note">{say("wc.t.noLineups")}</p> : null}
        </section>
      ) : null}
      {scorers.length ? (
        <section className="section scroll" id="scorers">
          <h2>{say("wc.t.scorers")}</h2>
          <WcScorersTable lines={buildWcScorers(scorers)} full hrefAll={here} />
          {scorers.some((s) => s.person_id == null) ? <p className="note">{say("wc.t.scorerNamesOnly")}</p> : null}
        </section>
      ) : null}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
