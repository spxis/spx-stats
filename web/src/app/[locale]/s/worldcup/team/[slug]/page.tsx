import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SoccerFlag } from "@/components/SoccerFlag";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getSoccerTeams, getTeamMatches, getTeamRecords, getTeamTournaments, teamBySlug } from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { h2hPath, opponentRecords, type OpponentRecord } from "@/lib/soccerH2H";
import { isTeamSlug, soccerMatchPath, soccerTeamPath, tournamentPath, WORLDCUP_PATH, WORLDCUP_TEAMS_PATH } from "@/lib/soccerPath";
import { groupLabel, reachRank, reached } from "@/lib/soccerView";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 86400;

// Nothing is drawn at build time: each team is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/worldcup/team/[slug]">;

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { slug } = await params;
  const team = isTeamSlug(slug) ? await teamBySlug(slug) : null;
  if (!team) return {};
  const { say, locale } = await currentSpeaker();
  const name = teamName({ name: team.name, slug: team.slug, flag: team.flag_code }, locale);
  return pageMeta({ title: say("wc.team.title", { team: name }), description: say("wc.team.metaDesc", { team: name }), path: soccerTeamPath(team.slug), locale });
});

export default guard(async function SoccerTeamPage({ params }: Params) {
  const { slug } = await params;
  const team = isTeamSlug(slug) ? await teamBySlug(slug) : null;
  if (!team) notFound();
  const { say, fmt, dt, locale, plural } = await currentSpeaker();
  const [matches, tournaments, records, all] = await Promise.all([getTeamMatches(team.team_id), getTeamTournaments(team.team_id), getTeamRecords(), getSoccerTeams()]);
  const mine = records.filter((r) => r.team_id === team.team_id);
  const name = teamName({ name: team.name, slug: team.slug, flag: team.flag_code }, locale);
  const earlier = team.continues_team_id ? all.find((x) => x.team_id === team.continues_team_id) : undefined;
  const later = all.filter((x) => x.continues_team_id === team.team_id);
  const day = (iso: string) => dt.ymd(new Date(iso));
  const heading = (league: string) => say(league === "wwc" ? "wc.womens" : "wc.mens");

  const recordTable = tableOf(mine, [
    { key: "comp", label: say("wc.col.competition"), cls: "team", get: (r) => r.league, cell: (r) => heading(r.league) },
    { key: "tournaments", label: say("wc.col.tournaments"), num: true, get: (r) => r.tournaments },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (r) => r.played },
    { key: "w", label: say("wc.col.w"), num: true, get: (r) => r.won },
    { key: "d", label: say("wc.col.d"), num: true, get: (r) => r.drawn },
    { key: "l", label: say("wc.col.l"), num: true, get: (r) => r.lost },
    { key: "gf", label: say("wc.col.gf"), title: say("wc.col.goalsForTitle"), num: true, get: (r) => r.goals_for, cell: (r) => fmt(r.goals_for) },
    { key: "ga", label: say("wc.col.ga"), title: say("wc.col.goalsAgainstTitle"), num: true, get: (r) => r.goals_against, cell: (r) => fmt(r.goals_against) },
  ], (r) => r.league);

  const tourTable = tableOf(tournaments, [
    { key: "year", label: say("wc.col.year"), num: true, get: (x) => x.year, cell: (x) => <Link href={tournamentPath(x.year)} prefetch={false}>{x.year}</Link> },
    { key: "comp", label: say("wc.col.competition"), cls: "team", get: (x) => x.league, cell: (x) => heading(x.league) },
    { key: "reached", label: say("wc.col.reached"), cls: "team", get: (x) => reachRank(x), cell: (x) => reached(say, x) },
    { key: "group", label: say("wc.col.group"), get: (x) => x.group_name, cell: (x) => x.group_name?.replace(/^Group\s+/, "") ?? "" },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (x) => x.played },
    { key: "w", label: say("wc.col.w"), num: true, get: (x) => x.won },
    { key: "d", label: say("wc.col.d"), num: true, get: (x) => x.drawn },
    { key: "l", label: say("wc.col.l"), num: true, get: (x) => x.lost },
    { key: "gf", label: say("wc.col.gf"), num: true, get: (x) => x.goals_for },
    { key: "ga", label: say("wc.col.ga"), num: true, get: (x) => x.goals_against },
    { key: "manager", label: say("wc.col.manager"), cls: "team", get: (x) => x.managers?.join(", ") ?? "" },
  ], (x) => x.tournament_id);

  const matchTable = tableOf(matches, [
    { key: "date", label: say("col.date"), get: (m) => m.match_date, cell: (m) => day(m.match_date) },
    { key: "stage", label: say("wc.col.stage"), get: (m) => m.stage_order, cell: (m) => groupLabel(say, m) },
    { key: "opp", label: say("col.opponent"), cls: "team", get: (m) => m.opponent, cell: (m) => <SoccerTeamName slug={m.opponent_slug} name={m.opponent} flag={m.opponent_flag} /> },
    {
      key: "score", label: say("col.score"), get: (m) => m.gf - m.ga,
      cell: (m) => {
        const tail = m.shootout && m.pens_for != null ? ` (${m.pens_for}–${m.pens_against})` : m.extra_time ? ` ${say("wc.aetShort")}` : "";
        return <Link href={soccerMatchPath(m.year, m.match_id, m.is_home ? team.name : m.opponent, m.is_home ? m.opponent : team.name)} prefetch={false}>{`${m.gf}–${m.ga}${tail}`}</Link>;
      },
    },
    { key: "result", label: say("col.result"), get: (m) => (m.result === "w" ? 3 : m.result === "d" ? 1 : 0), cell: (m) => say(m.result === "w" ? "wc.col.w" : m.result === "d" ? "wc.col.d" : "wc.col.l") },
    { key: "venue", label: say("col.venue"), cls: "team", get: (m) => m.venue_name, cell: (m) => [m.venue_name, m.venue_city].filter(Boolean).join(", ") },
  ], (m) => m.match_id);

  // The record against each opponent, men's and women's apart; each row opens the head-to-head page of the two teams (lib/soccerH2H.ts).
  const opponents = opponentRecords(matches);
  const opponentTable = (league: string) => tableOf(opponents.filter((r) => r.league === league), [
    { key: "opp", label: say("col.opponent"), cls: "team", get: (r: OpponentRecord) => teamName({ name: r.opponent, slug: r.opponent_slug, flag: r.opponent_flag }, locale), cell: (r: OpponentRecord) => <SoccerTeamName slug={r.opponent_slug} name={r.opponent} flag={r.opponent_flag} /> },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (r) => r.played },
    { key: "w", label: say("wc.col.w"), num: true, get: (r) => r.won },
    { key: "d", label: say("wc.col.d"), num: true, get: (r) => r.drawn },
    { key: "l", label: say("wc.col.l"), num: true, get: (r) => r.lost },
    { key: "gf", label: say("wc.col.gf"), title: say("wc.col.goalsForTitle"), num: true, get: (r) => r.goals_for },
    { key: "ga", label: say("wc.col.ga"), title: say("wc.col.goalsAgainstTitle"), num: true, get: (r) => r.goals_against },
    { key: "so", label: say("wc.col.shootouts"), title: say("wc.col.shootoutsTitle"), num: true, get: (r) => r.pens_won + r.pens_lost, cell: (r) => (r.pens_won + r.pens_lost ? `${r.pens_won}–${r.pens_lost}` : "") },
    { key: "last", label: say("wc.col.lastMet"), num: true, get: (r) => r.last_year },
    { key: "all", label: "", get: (r) => r.opponent, cell: (r) => <Link href={h2hPath(team.slug, r.opponent_slug)} prefetch={false}>{say("wc.h2h.all")}</Link> },
  ], (r) => r.opponent_id);

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("wc.team.eyebrow")}</span>
        <h1><span className="sct"><SoccerFlag code={team.flag_code} name={name} large />{name}</span></h1>
        <p className="lede">{say("wc.team.lede", { team: name, tournaments: plural("count.tournaments", tournaments.length), matches: plural("count.matches", matches.length) })}</p>
        {earlier ? <p className="note">{say("wc.team.continues")} <SoccerTeamName slug={earlier.slug} name={earlier.name} flag={earlier.flag_code} /></p> : null}
        {later.length ? <p className="note">{say("wc.team.continuedBy")} {later.map((x) => <SoccerTeamName key={x.team_id} slug={x.slug} name={x.name} flag={x.flag_code} />)}</p> : null}
        <p className="note"><Link href={WORLDCUP_TEAMS_PATH}>{say("wc.team.all")}</Link> · <Link href={WORLDCUP_PATH}>{say("wc.t.all")}</Link></p>
      </section>
      {mine.length ? (
        <section className="section scroll">
          <h2>{say("wc.team.record")}</h2>
          <div className="tablebox"><SortTable {...recordTable} /></div>
          <p className="note">{say("wc.teams.note")}</p>
        </section>
      ) : <section className="section"><p className="note">{say("wc.team.none")}</p></section>}
      {tournaments.length ? (
        <section className="section scroll">
          <h2>{say("wc.team.tournaments")}</h2>
          <div className="tablebox"><SortTable {...tourTable} def="year.desc" param="sort_past" /></div>
        </section>
      ) : null}
      {matches.length ? (
        <section className="section scroll">
          <h2>{say("wc.t.matches")}</h2>
          <div className="tablebox"><SortTable {...matchTable} def="date.desc" param="sort_games" /></div>
        </section>
      ) : null}
      {opponents.length ? (
        <section className="section scroll" id="opponents">
          <h2>{say("wc.team.opponents")}</h2>
          {(["wc", "wwc"] as const).filter((l) => opponents.some((r) => r.league === l)).map((l) => (
            <div key={l}>
              {mine.length > 1 ? <h3>{heading(l)}</h3> : null}
              <div className="tablebox"><SortTable {...opponentTable(l)} def="p.desc,w.desc" param={l === "wwc" ? "sort_women" : "sort_men"} /></div>
            </div>
          ))}
          <p className="note">{say("wc.team.opponentsNote")}</p>
        </section>
      ) : null}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
