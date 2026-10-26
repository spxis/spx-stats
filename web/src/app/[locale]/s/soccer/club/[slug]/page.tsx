import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { EuropeClubName, EuropeCredit } from "@/components/EuropeBits";
import { FamilyNav } from "@/components/FamilyNav";
import { SortTable } from "@/components/SortTable";
import { europeClubBySlug, getEuropeClubMoves, getEuropeClubSeasons, getEuropeClubStandings, getEuropeSeasons, hasContent } from "@/lib/europe";
import { EUROPE_PATH, europeClubPath, europeLeaguePath, europeSeasonPath, seasonLabel } from "@/lib/europePath";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each club is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/soccer/club/[slug]">;
const isSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { slug } = await params;
  const club = isSlug(slug) ? await europeClubBySlug(slug) : null;
  if (!club) return {};
  const { say, locale } = await currentSpeaker();
  const name = club.latest_name ?? club.name;
  return pageMeta({ title: name, description: say("europe.c.metaDesc", { team: name }), path: europeClubPath(club.slug), locale });
});

/** A club of the European leagues: every season it played in the divisions held here, where it finished and whether it went up or down. */
export default guard(async function EuropeClubPage({ params }: Params) {
  const { slug } = await params;
  const club = isSlug(slug) ? await europeClubBySlug(slug) : null;
  if (!club) notFound();
  const { say, plural } = await currentSpeaker();
  const [seasons, moves, standings, all] = await Promise.all([getEuropeClubSeasons(club.team_id), getEuropeClubMoves(club.team_id), getEuropeClubStandings(club.team_id), getEuropeSeasons()]);
  const name = club.latest_name ?? club.name;
  const season = new Map(all.map((s) => [s.tournament_id, s]));
  const move = new Map(moves.map((m) => [m.from_year, m.move]));
  const place = new Map(standings.map((r) => [r.tournament_id, r]));
  const titles = all.filter((s) => s.champion_id === club.team_id && s.tier === 1);
  const span = club.first_year === club.last_year ? String(club.first_year) : `${club.first_year}–${club.last_year}`;

  const table = tableOf(seasons, [
    {
      key: "year", label: say("europe.col.season"), num: true, get: (x) => x.year,
      cell: (x) => { const s = season.get(x.tournament_id); return s && hasContent(s) ? <Link href={europeSeasonPath(x.league, x.year)} prefetch={false}>{seasonLabel(x.year)}</Link> : seasonLabel(x.year); },
    },
    {
      key: "division", label: say("europe.col.division"), cls: "team", get: (x) => season.get(x.tournament_id)?.league_name ?? x.league,
      cell: (x) => { const s = season.get(x.tournament_id); return s && s.has_table || s && s.matches ? <Link href={europeLeaguePath(x.league)} prefetch={false}>{s.league_name}</Link> : (s?.league_name ?? x.league); },
    },
    { key: "tier", label: say("europe.col.tier"), num: true, get: (x) => x.tier },
    { key: "name", label: say("col.team"), cls: "team", get: (x) => x.team_name, cell: (x) => <EuropeClubName slug={club.slug} name={x.team_name} link={false} /> },
    { key: "pos", label: say("europe.col.pos"), num: true, get: (x) => place.get(x.tournament_id)?.position ?? null },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (x) => place.get(x.tournament_id)?.played ?? (x.matches || null) },
    { key: "pts", label: say("col.pts"), num: true, get: (x) => place.get(x.tournament_id)?.points ?? null },
    {
      key: "next", label: say("europe.col.next"), cls: "team", get: (x) => move.get(x.year) ?? null,
      cell: (x) => { const mv = move.get(x.year); return mv === "promoted" || mv === "relegated" ? <span className={`eu-move-${mv}`}>{say(mv === "promoted" ? "europe.move.promoted" : "europe.move.relegated")}</span> : mv === "stayed" ? say("europe.move.stayed") : ""; },
    },
  ], (x) => x.tournament_id);

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("europe.c.eyebrow")}</span>
        <h1>{name}</h1>
        <FamilyNav family="soccer" europe="" />
        <p className="lede">{say("europe.c.lede", { team: name, span, seasons: plural("count.seasons", club.seasons) })}</p>
        <p className="note"><Link href={EUROPE_PATH}>{say("europe.c.all")}</Link></p>
      </section>
      {titles.length ? (
        <section className="section">
          <h2>{say("europe.c.titles")}</h2>
          <p><b>{titles.length}</b>: {titles.map((s, i) => <span key={s.tournament_id}>{i ? ", " : ""}<Link href={europeSeasonPath(s.league, s.year)} prefetch={false}>{seasonLabel(s.year)}</Link></span>)}</p>
        </section>
      ) : null}
      {seasons.length ? (
        <section className="section scroll" id="seasons">
          <h2>{say("europe.c.seasons")}</h2>
          <div className="tablebox"><SortTable {...table} def="year.desc" param="sort_past" /></div>
          <p className="note">{say("europe.c.seasonsNote")}</p>
        </section>
      ) : null}
      <section className="section"><EuropeCredit say={say} /></section>
    </div>
  );
});
