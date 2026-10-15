import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { MlsCredit } from "@/components/MlsCredit";
import { SeriesStyle } from "@/components/SeriesStyle";
import { Showdown, type ShowdownSide } from "@/components/Showdown";
import { BadgeCup } from "@/components/TrophyMark";
import { StadiumName } from "@/components/StadiumName";
import { SoccerSurface } from "@/components/GameSurface";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMlsMatch, getMlsSeasonTeams } from "@/lib/mls";
import { MLS_PATH, mlsClubPath, mlsMatchPath, mlsSeasonPath } from "@/lib/mlsPath";
import { mlsScoreLines, mlsStageName } from "@/lib/mlsView";
import type { Match } from "@/lib/soccer";
import { gameOrder, placeOf } from "@/lib/sides";
import { clubAbbr, neutralLooks } from "@/lib/soccerLook";
import { soccerMatchIdOf } from "@/lib/soccerPath";
import "@/components/soccer.css";

export const revalidate = 86400;

// Nothing is drawn at build time: each match is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/mls/[year]/match/[match]">;

async function find(year: string, seg: string): Promise<Match | null> {
  const id = /^\d{4}$/.test(year) ? soccerMatchIdOf(seg) : null;
  const m = id == null ? null : await getMlsMatch(id);
  return m && String(m.year) === year ? m : null;
}

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { year, match } = await params;
  const m = await find(year, match);
  if (!m) return {};
  const { say, locale } = await currentSpeaker();
  const title = `${m.home} ${m.home_goals}–${m.away_goals} ${m.away}`;
  return pageMeta({
    title,
    description: say("mls.m.metaDesc", { title, stage: mlsStageName(say, m.stage_key), year: m.year }),
    path: mlsMatchPath(m.year, m.match_id, m.home, m.away),
    locale,
  });
});

export default guard(async function MlsMatchPage({ params }: Params) {
  const { year, match } = await params;
  const m = await find(year, match);
  if (!m) notFound();
  const canonical = mlsMatchPath(m.year, m.match_id, m.home, m.away);
  if (`/mls/${year}/match/${match}` !== canonical) permanentRedirect(canonical);
  const { say, fmt, dt } = await currentSpeaker();
  const sc = mlsScoreLines(say, m);
  const entries = await getMlsSeasonTeams(m.tournament_id);
  // The banner: the home side first (as the heading and the strip). The archive holds no club colours or logos (a club's emblem is not ours to draw), so the
  // two sides are the neutral pair, each with its short name as a monogram.
  const looks = neutralLooks();
  const abbrs = [clubAbbr(m.home_team_id, m.home), clubAbbr(m.away_team_id, m.away)] as const;
  const names = [m.home, m.away] as const;
  const winner: 0 | 1 | null = m.winner_team_id === m.home_team_id ? 0 : m.winner_team_id === m.away_team_id ? 1 : m.home_goals > m.away_goals ? 0 : m.away_goals > m.home_goals ? 1 : null;
  // Left and right (lib/sides.ts): soccer lists the home side first (FIFA's Team A), so it is on the left in the banner, the surface and the panels, as in the heading. The data above is home first too.
  const order = gameOrder(0, winner, undefined, "soccer");
  const [ia, ib] = order;
  const goals = [m.home_goals, m.away_goals] as const;
  const bannerSide = (i: 0 | 1): ShowdownSide => {
    const id = i === 0 ? m.home_team_id : m.away_team_id, slug = i === 0 ? m.home_slug : m.away_slug;
    const e = entries.find((x) => x.team_id === id);
    const gf = e?.goals_for, ga = e?.goals_against;
    const record = e && e.wins != null && e.losses != null && gf != null && ga != null
      ? (e.shootout_wins ?? 0) > 0
        ? say("mls.sd.recordSo", { year: m.year, w: e.wins, l: e.losses, sw: e.shootout_wins ?? 0, gf, ga })
        : e.draws != null ? say("mls.sd.record", { year: m.year, w: e.wins, d: e.draws, l: e.losses, gf, ga }) : null
      : null;
    return {
      crest: <span className="crest"><span className="mono">{abbrs[i]}</span></span>,
      name: <Link href={mlsClubPath(slug)} prefetch={false}>{names[i]}</Link>,
      tag: winner === i && m.stage_key === "final" ? <><BadgeCup league="mls" />{say("mls.sd.champions")}</> : null,
      meta: record ? [record] : [],
      links: [
        <Link key="club" href={mlsClubPath(slug)} prefetch={false}>{say("mls.sd.team", { club: names[i] })}</Link>,
        <Link key="season" href={mlsSeasonPath(m.year)} prefetch={false}>{say("mls.season", { year: m.year })}</Link>,
      ],
      lost: winner != null && winner !== i,
    };
  };
  // A stadium is shown as the source names it; the name links to /venue/Q<m.venue_wikidata_id>, which redirects to the venue's own page, when the
  // world stadium dataset holds the ground (m.venue_id), else it is plain text.
  const venueRest = [m.venue_city, m.venue_country].filter(Boolean).join(", ");
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow"><Link href={mlsSeasonPath(m.year)}>{say("mls.season", { year: m.year })}</Link> · {mlsStageName(say, m.stage_key)}</span>
        <h1>{m.home} – {m.away}</h1>
        <p className="lede">{dt.full(new Date(m.match_date))}{m.venue_name ? <> · <StadiumName name={m.venue_name} qid={m.venue_wikidata_id} linked={m.venue_id != null} rest={venueRest} /></> : null}{m.attendance ? ` · ${say("mls.m.crowd", { n: fmt(m.attendance) })}` : ""}</p>
      </section>
      <SeriesStyle a={looks[ia]} b={looks[ib]} />
      <Showdown
        label={say("wc.m.result")} a={bannerSide(ia)} b={bannerSide(ib)} winner={winner == null ? null : placeOf(order, winner)} level={winner == null}
        score={[goals[ia], goals[ib]]} scoreLabel={say("wc.sd.score", { a: goals[ia], b: goals[ib] })}
        verdict={winner == null ? say("wc.sd.draw") : say("wc.sd.win", { team: names[winner] })}
        notes={[sc.note, say("wc.sd.stageDate", { stage: mlsStageName(say, m.stage_key), date: dt.full(new Date(m.match_date)) })].filter((x): x is string => !!x)}
      />
      <SoccerSurface
        home={{ name: names[0], abbr: abbrs[0], goals: m.home_goals, penalties: m.shootout ? m.home_penalties : null, color: looks[0].block, ink: looks[0].on }}
        away={{ name: names[1], abbr: abbrs[1], goals: m.away_goals, penalties: m.shootout ? m.away_penalties : null, color: looks[1].block, ink: looks[1].on }}
        note={sc.note} finish={m.shootout ? "pens" : m.shootout_style === "mls" && m.winner_team_id ? "so" : m.extra_time ? "aet" : null} winner={winner === 0 ? "home" : winner === 1 ? "away" : "none"}
        competition={`${say("mls.season", { year: m.year })} · ${mlsStageName(say, m.stage_key)}`} date={dt.full(new Date(m.match_date))} wikidata={m.venue_wikidata_id}
      />
      {m.checked === 1 ? <p className="note">{say("mls.m.confirmed")}</p> : null}
      <p className="note">{say("mls.m.noDetail")} <Link href={MLS_PATH}>{say("mls.team.all")}</Link></p>
      <section className="section"><MlsCredit say={say} /></section>
    </div>
  );
});
