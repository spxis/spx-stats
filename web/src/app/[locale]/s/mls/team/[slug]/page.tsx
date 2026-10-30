import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { MlsClubMatches } from "@/components/MlsClubMatches";
import { MlsClubName } from "@/components/MlsClubName";
import { MlsCredit } from "@/components/MlsCredit";
import { SortTable } from "@/components/SortTable";
import { StadiumName } from "@/components/StadiumName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMlsClubMatches, getMlsClubNames, getMlsClubSeasons, getMlsAllTime, mlsClubBySlug } from "@/lib/mls";
import { buildMlsClubMatches } from "@/lib/mlsClubLines";
import { MLS_PATH, mlsClubPath, mlsSeasonPath } from "@/lib/mlsPath";
import { mlsReachRank, mlsReached } from "@/lib/mlsView";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each club is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/mls/team/[slug]">;
const isSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { slug } = await params;
  const club = isSlug(slug) ? await mlsClubBySlug(slug) : null;
  if (!club) return {};
  const { say, locale } = await currentSpeaker();
  const name = club.latest_name ?? club.name;
  return pageMeta({ title: say("mls.team.title", { team: name }), description: say("mls.team.metaDesc", { team: name }), path: mlsClubPath(club.slug), locale });
});

export default guard(async function MlsClubPage({ params }: Params) {
  const { slug } = await params;
  const club = isSlug(slug) ? await mlsClubBySlug(slug) : null;
  if (!club) notFound();
  const { say, fmt, plural } = await currentSpeaker();
  const [names, seasons, matches, allTime] = await Promise.all([getMlsClubNames(club.team_id), getMlsClubSeasons(club.team_id), getMlsClubMatches(club.team_id), getMlsAllTime()]);
  const rec = allTime.find((r) => r.team_id === club.team_id);
  const name = club.latest_name ?? club.name;
  const span = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);
  const cups = seasons.filter((x) => x.champion).map((x) => x.year);
  const shields = seasons.filter((x) => x.shield).map((x) => x.year);
  const finals = seasons.filter((x) => x.performance === "final").map((x) => x.year);
  const yearLinks = (years: number[]) => years.map((y, i) => <span key={y}>{i ? ", " : ""}<Link href={mlsSeasonPath(y)} prefetch={false}>{y}</Link></span>);

  const seasonTable = tableOf(seasons, [
    { key: "year", label: say("wc.col.year"), num: true, get: (x) => x.year, cell: (x) => <Link href={mlsSeasonPath(x.year)} prefetch={false}>{x.year}</Link> },
    { key: "name", label: say("mls.col.name"), cls: "team", get: (x) => x.team_name, cell: (x) => <MlsClubName slug={club.slug} name={x.team_name} link={false} /> },
    { key: "conf", label: say("mls.col.conference"), cls: "team", get: (x) => x.conference, cell: (x) => (x.conference === "Eastern Conference" ? say("mls.east") : x.conference === "Western Conference" ? say("mls.west") : "") },
    { key: "place", label: say("mls.col.place"), num: true, get: (x) => x.overall_position },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (x) => x.played },
    { key: "w", label: say("wc.col.w"), num: true, get: (x) => x.wins },
    { key: "d", label: say("wc.col.d"), num: true, get: (x) => x.draws },
    { key: "l", label: say("wc.col.l"), num: true, get: (x) => x.losses },
    { key: "gf", label: say("wc.col.gf"), num: true, get: (x) => x.goals_for },
    { key: "ga", label: say("wc.col.ga"), num: true, get: (x) => x.goals_against },
    { key: "pts", label: say("col.pts"), num: true, get: (x) => x.points },
    { key: "result", label: say("wc.col.reached"), cls: "team", get: (x) => mlsReachRank(x.performance), cell: (x) => mlsReached(say, x.performance) },
    { key: "venue", label: say("col.venue"), cls: "team", get: (x) => x.venue_name, cell: (x) => <StadiumName name={x.venue_name} qid={x.venue_wikidata_id} rest={x.venue_city ?? undefined} /> },
  ], (x) => x.tournament_id);

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("mls.team.eyebrow")}</span>
        <h1>{name}</h1>
        <p className="lede">{say("mls.team.lede", { team: name, span: span(club.first_year, club.last_year), seasons: plural("count.seasons", club.seasons) })}</p>
        <p className="note"><Link href={MLS_PATH}>{say("mls.team.all")}</Link></p>
      </section>
      {names.length > 1 ? (
        <section className="section">
          <h2>{say("mls.team.names")}</h2>
          <ul className="sc-list">
            {names.map((n) => <li key={`${n.name}-${n.from_year}`}><b>{n.name}</b> · {span(n.from_year, n.to_year)}</li>)}
          </ul>
        </section>
      ) : null}
      {cups.length || shields.length || finals.length ? (
        <section className="section">
          <h2>{say("mls.team.titles")}</h2>
          <ul className="sc-list">
            {cups.length ? <li><b>{say("mls.team.cups", { n: cups.length })}</b> {yearLinks(cups)}</li> : null}
            {shields.length ? <li><b>{say("mls.team.shields", { n: shields.length })}</b> {yearLinks(shields)}</li> : null}
            {finals.length ? <li><b>{say("mls.team.finalsLost", { n: finals.length })}</b> {yearLinks(finals)}</li> : null}
          </ul>
        </section>
      ) : null}
      {rec ? (
        <section className="section">
          <h2>{say("mls.team.record")}</h2>
          <p>{say("mls.team.recordLine", { p: fmt(rec.played), w: fmt(rec.won), d: fmt(rec.drawn), l: fmt(rec.lost), gf: fmt(rec.goals_for), ga: fmt(rec.goals_against) })}</p>
          <p className="note">{say("mls.team.recordNote")}</p>
        </section>
      ) : null}
      {seasons.length ? (
        <section className="section scroll" id="seasons">
          <h2>{say("mls.team.seasons")}</h2>
          <div className="tablebox"><SortTable {...seasonTable} def="year.desc" param="sort_past" /></div>
        </section>
      ) : null}
      {matches.length ? (
        <section className="section scroll" id="matches">
          <h2>{say("wc.t.matches")}</h2>
          <MlsClubMatches clubName={club.name} wire={buildMlsClubMatches(matches)} />
        </section>
      ) : null}
      <section className="section"><MlsCredit say={say} /></section>
    </div>
  );
});
