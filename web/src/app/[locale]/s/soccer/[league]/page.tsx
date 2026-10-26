import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { EuropeClubName, EuropeCredit } from "@/components/EuropeBits";
import { FamilyNav } from "@/components/FamilyNav";
import { SortTable } from "@/components/SortTable";
import { Figures } from "@/components/ui";
import { getEuropeLeague, hasContent } from "@/lib/europe";
import { europeSeasonPath, leagueOfSlug, seasonLabel } from "@/lib/europePath";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 86400;

// Nothing is drawn at build time: each division is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/soccer/[league]">;

async function seasonsOf(slug: string) {
  const code = leagueOfSlug(slug);
  const seasons = code ? (await getEuropeLeague(code)).filter(hasContent) : [];
  return { code, seasons };
}

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { league } = await params;
  const { seasons } = await seasonsOf(league);
  if (!seasons.length) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: seasons[0].league_name, description: say("europe.metaDesc", { league: seasons[0].league_name }), path: `/soccer/${league}`, locale });
});

/** One division of a European pyramid: every season held with its champion, and the clubs ranked by titles. */
export default guard(async function EuropeLeaguePage({ params }: Params) {
  const { league } = await params;
  const { code, seasons } = await seasonsOf(league);
  if (!code || !seasons.length) notFound();
  const { say, fmt, plural } = await currentSpeaker();
  const name = seasons[0].league_name;
  const matches = seasons.reduce((n, s) => n + s.matches + s.playoff_matches, 0);
  const goals = seasons.reduce((n, s) => n + s.goals, 0);

  const seasonTable = tableOf(seasons, [
    { key: "year", label: say("europe.col.season"), num: true, get: (s) => s.year, cell: (s) => <Link href={europeSeasonPath(s.league, s.year)} prefetch={false}>{seasonLabel(s.year)}</Link> },
    { key: "clubs", label: say("europe.col.clubs"), num: true, get: (s) => s.team_count },
    {
      key: "champion", label: say("europe.col.champion"), cls: "team", get: (s) => s.champion,
      cell: (s) => (s.champion && s.champion_slug ? <EuropeClubName slug={s.champion_slug} name={s.champion} /> : s.complete ? "" : say("europe.inProgress")),
    },
    { key: "runnerup", label: say("europe.col.runnerUp"), cls: "team", get: (s) => s.runner_up, cell: (s) => (s.runner_up && s.runner_up_slug ? <EuropeClubName slug={s.runner_up_slug} name={s.runner_up} /> : "") },
    {
      key: "matches", label: say("europe.col.matches"), num: true, get: (s) => s.matches,
      cell: (s) => {
        const full = (s.team_count ?? 0) * ((s.team_count ?? 0) - 1);
        return !s.matches ? "" : !s.complete && full > s.matches ? `${fmt(s.matches)} / ${fmt(full)}` : fmt(s.matches);
      },
    },
    { key: "goals", label: say("europe.col.goals"), num: true, get: (s) => (s.matches ? s.goals : null), cell: (s) => (s.matches ? fmt(s.goals) : "") },
    { key: "per", label: say("europe.col.perMatch"), num: true, get: (s) => (s.matches ? s.goals / s.matches : null), cell: (s) => (s.matches ? fmt(Math.round((s.goals / s.matches) * 100) / 100) : "") },
  ], (s) => s.tournament_id);

  const titles = new Map<string, { name: string; slug: string; years: number[] }>();
  for (const s of seasons) {
    if (!s.champion_id || !s.champion || !s.champion_slug) continue;
    const t = titles.get(s.champion_id) ?? { name: s.champion, slug: s.champion_slug, years: [] };
    t.years.push(s.year);
    titles.set(s.champion_id, t);
  }
  const winners = [...titles.entries()].map(([id, t]) => ({ id, ...t }));
  const titleTable = tableOf(winners, [
    { key: "club", label: say("col.team"), cls: "team", get: (t) => t.name, cell: (t) => <EuropeClubName slug={t.slug} name={t.name} /> },
    { key: "titles", label: say("europe.col.titles"), num: true, get: (t) => t.years.length },
    {
      key: "years", label: say("europe.col.years"), get: (t) => t.years[0],
      cell: (t) => t.years.map((y, i) => <span key={y}>{i ? ", " : ""}<Link href={europeSeasonPath(code, y)} prefetch={false}>{seasonLabel(y)}</Link></span>),
    },
  ], (t) => t.id);

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("nav.soccer")}</span>
        <h1>{name}</h1>
        <FamilyNav family="soccer" europe={code} />
        <p className="lede">{say("europe.lede", { league: name, seasons: plural("count.seasons", seasons.length), first: seasonLabel(seasons[0].year), last: seasonLabel(seasons.at(-1)!.year) })}</p>
      </section>
      <Figures items={[[say("europe.seasons"), seasons.length], [say("soccer.matches"), matches], [say("soccer.goals"), goals]]} />
      <section className="section scroll" id="seasons">
        <h2>{say("europe.seasons")}</h2>
        <div className="tablebox"><SortTable {...seasonTable} def="year.desc" param="sort_seasons" /></div>
        <p className="note">{say("europe.seasonsNote")}</p>
      </section>
      {winners.length ? (
        <section className="section scroll" id="titles">
          <h2>{say("europe.titles")}</h2>
          <div className="tablebox"><SortTable {...titleTable} def="titles.desc" param="sort_clubs" /></div>
        </section>
      ) : null}
      <section className="section"><EuropeCredit say={say} /></section>
    </div>
  );
});
