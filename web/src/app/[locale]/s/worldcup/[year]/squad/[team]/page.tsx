import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { positionBook } from "@/components/PositionKey";
import { SoccerCredit } from "@/components/SoccerCredit";
import { squadLabels } from "@/components/SoccerSquads";
import { SoccerSquadTable } from "@/components/SoccerSquadTable";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getSoccerTeams, getSquads, tournamentOfYear } from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { isTeamSlug, isYearSeg, tournamentPath } from "@/lib/soccerPath";
import { squadLine, squadPath } from "@/lib/soccerSquad";
import "@/components/soccer.css";

export const revalidate = 3600;

// Nothing is drawn at build time: each squad is drawn on its first visit, then kept and revalidated like the tournament page.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/worldcup/[year]/squad/[team]">;

/** The tournament, the team and its squad; null when the address names no squad. */
async function load(year: string, slug: string) {
  if (!isYearSeg(year) || !isTeamSlug(slug)) return null;
  const t = await tournamentOfYear(Number(year));
  if (!t) return null;
  const [squads, teams] = await Promise.all([getSquads(t.tournament_id), getSoccerTeams()]);
  const mine = squads.filter((s) => s.team_slug === slug);
  if (!mine.length) return null;
  return { t, mine, team: teams.find((x) => x.slug === slug) ?? null };
}

const titleOf = (say: Awaited<ReturnType<typeof currentSpeaker>>["say"], t: { league: string; year: number }) =>
  say(t.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: t.year });

export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { year, team } = await params;
  const got = await load(year, team);
  if (!got) return {};
  const { say, locale } = await currentSpeaker();
  const name = teamName({ name: got.mine[0].team, slug: team, flag: got.team?.flag_code }, locale);
  const title = say("wc.squad.page", { team: name, title: titleOf(say, got.t) });
  return pageMeta({ title, description: title, path: squadPath(got.t.year, team), locale });
});

/** One team's squad at a tournament: the page the closed lists of the tournament page link to (and load their rows from, as JSON, beside it). */
export default guard(async function SquadPage({ params }: Props) {
  const { year, team: slug } = await params;
  const got = await load(year, slug);
  if (!got) notFound();
  const { t, mine, team } = got;
  const { say, locale } = await currentSpeaker();
  const book = await positionBook();
  const name = teamName({ name: mine[0].team, slug, flag: team?.flag_code }, locale);
  const tournament = titleOf(say, t);
  const lines = mine.map((s) => squadLine(s, (code) => book.name(code, ["soccer"]) ?? null));
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say(t.league === "wwc" ? "wc.womens" : "wc.mens")}</span>
        <h1>{say("wc.squad.page", { team: name, title: tournament })}</h1>
        <p className="lede"><SoccerTeamName slug={slug} name={mine[0].team} flag={team?.flag_code} /></p>
        <p className="note"><Link href={`${tournamentPath(t.year)}#squads`}>{say("wc.squad.back", { title: tournament })}</Link></p>
      </section>
      <section className="section scroll">
        <div className="tablebox"><SoccerSquadTable lines={lines} labels={squadLabels(say)} /></div>
      </section>
      {book.key()}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
