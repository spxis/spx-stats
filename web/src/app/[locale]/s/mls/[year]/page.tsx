import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MlsClubName } from "@/components/MlsClubName";
import { MlsCredit } from "@/components/MlsCredit";
import { MlsPlayoffs } from "@/components/MlsPlayoffs";
import { MlsTables } from "@/components/MlsTables";
import { SortTable } from "@/components/SortTable";
import { StadiumName } from "@/components/StadiumName";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMlsLeaders, getMlsMatches, getMlsSeasonTeams, getMlsStandings, mlsSeasonOfYear, type Leader } from "@/lib/mls";
import { MLS_PATH, mlsMatchPath, mlsSeasonPath } from "@/lib/mlsPath";
import { mlsReachRank, mlsReached, mlsScoreLines, mlsStageName } from "@/lib/mlsView";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 3600;

// Nothing is drawn at build time: each season is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/mls/[year]">;
const isYear = (s: string) => /^\d{4}$/.test(s);

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { year } = await params;
  if (!isYear(year)) return {};
  const s = await mlsSeasonOfYear(Number(year));
  if (!s) return {};
  const { say, locale } = await currentSpeaker();
  const title = say("mls.season", { year: s.year });
  return pageMeta({
    title,
    description: say("mls.s.metaDesc", { title, champion: s.champion ?? "", shield: s.shield ?? "", matches: s.regular_matches + s.playoff_matches }),
    path: mlsSeasonPath(s.year),
    locale,
  });
});

export default guard(async function MlsSeasonPage({ params }: Params) {
  const { year } = await params;
  if (!isYear(year)) notFound();
  const s = await mlsSeasonOfYear(Number(year));
  if (!s) notFound();
  const { say, fmt, dt } = await currentSpeaker();
  const [teams, matches, standings, leaders] = await Promise.all([
    getMlsSeasonTeams(s.tournament_id), getMlsMatches(s.tournament_id), getMlsStandings(s.tournament_id), getMlsLeaders(s.tournament_id),
  ]);
  const day = (iso: string) => dt.ymd(new Date(iso));
  const dates = s.start_date && s.end_date ? `${day(s.start_date)} – ${day(s.end_date)}` : String(s.year);
  const playoff = matches.filter((m) => m.stage_key !== "regular");
  const per = s.regular_matches ? Math.round((s.regular_goals / s.regular_matches) * 100) / 100 : 0;

  const teamTable = tableOf(teams, [
    { key: "team", label: say("col.team"), cls: "team", get: (t) => t.team_name, cell: (t) => <MlsClubName slug={t.team_slug} name={t.team_name} /> },
    { key: "conf", label: say("mls.col.conference"), cls: "team", get: (t) => t.conference, cell: (t) => (t.conference === "Eastern Conference" ? say("mls.east") : t.conference === "Western Conference" ? say("mls.west") : "") },
    { key: "place", label: say("mls.col.place"), num: true, get: (t) => t.overall_position },
    { key: "pts", label: say("col.pts"), num: true, get: (t) => t.points },
    { key: "result", label: say("wc.col.reached"), cls: "team", get: (t) => mlsReachRank(t.performance), cell: (t) => mlsReached(say, t.performance) },
    { key: "venue", label: say("col.venue"), cls: "team", get: (t) => t.venue_name, cell: (t) => <StadiumName name={t.venue_name} qid={t.venue_wikidata_id} rest={t.venue_city ?? undefined} /> },
  ], (t) => t.team_id);

  const matchTable = tableOf(matches, [
    { key: "date", label: say("col.date"), get: (m) => m.match_date, cell: (m) => day(m.match_date) },
    { key: "stage", label: say("wc.col.stage"), get: (m) => m.stage_order, cell: (m) => mlsStageName(say, m.stage_key) },
    { key: "home", label: say("col.home"), cls: "team", get: (m) => m.home, cell: (m) => <MlsClubName slug={m.home_slug} name={m.home} /> },
    {
      key: "score", label: say("col.score"), get: (m) => m.home_goals + m.away_goals,
      cell: (m) => {
        const sc = mlsScoreLines(say, m);
        return <Link className="sc-score" href={mlsMatchPath(m.year, m.match_id, m.home, m.away)} prefetch={false}>{sc.main}{sc.note ? <small>{sc.note}</small> : null}</Link>;
      },
    },
    { key: "away", label: say("wc.col.away"), cls: "team", get: (m) => m.away, cell: (m) => <MlsClubName slug={m.away_slug} name={m.away} /> },
    { key: "venue", label: say("col.venue"), cls: "team", get: (m) => m.venue_name, cell: (m) => <StadiumName name={m.venue_name} qid={m.venue_wikidata_id} linked={m.venue_id != null} rest={m.venue_city ?? undefined} /> },
    { key: "crowd", label: say("mls.col.crowd"), num: true, get: (m) => m.attendance ?? null, cell: (m) => (m.attendance ? fmt(m.attendance) : "") },
  ], (m) => m.match_id);

  const board = (category: Leader["category"], title: string, unit: string) => {
    const list = leaders.filter((l) => l.category === category);
    if (!list.length) return null;
    return (
      <div key={category}>
        <h3>{title}</h3>
        <table className="sc-mini">
          <thead><tr><th className="num">#</th><th>{say("wc.col.player")}</th><th>{say("col.team")}</th><th className="num">{unit}</th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={`${l.rank}-${l.player_name}`}>
                <td className="num">{l.rank}</td><td className="team">{l.player_name}</td>
                <td className="team">{l.team_slug && l.team_name ? <MlsClubName slug={l.team_slug} name={l.team_name} /> : ""}</td>
                <td className="num"><b>{l.value}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  const awards = leaders.filter((l) => l.category === "award");
  const hasBoards = leaders.some((l) => l.category !== "award");

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("mls.title")}</span>
        <h1>{say("mls.season", { year: s.year })}</h1>
        <p className="lede">{say("mls.s.lede", { teams: s.team_count ?? teams.length, dates })}</p>
        <p className="note"><Link href={MLS_PATH}>{say("mls.s.all")}</Link></p>
      </section>
      <Figures items={[
        [say("wc.col.teams"), s.team_count ?? teams.length], [say("wc.col.matches"), s.regular_matches + s.playoff_matches], [say("wc.col.goals"), s.regular_goals],
        [say("wc.t.perMatch"), fmt(per)], ...(s.avg_attendance != null ? [[say("mls.col.crowd"), fmt(s.avg_attendance)] as [string, string]] : []),
      ]} />
      {s.champion || s.shield || !s.complete ? (
        <section className="section">
          <h2>{say("wc.t.result")}</h2>
          <ul className="sc-list">
            {s.champion && s.champion_slug ? <li><b>{say("mls.cupWinner")}</b> <MlsClubName slug={s.champion_slug} name={s.champion} /></li> : null}
            {s.runner_up && s.runner_up_slug ? <li><b>{say("wc.reach.runnerUp")}</b> <MlsClubName slug={s.runner_up_slug} name={s.runner_up} /></li> : null}
            {s.shield && s.shield_slug ? <li><b>{say("mls.shieldWinner")}</b> <MlsClubName slug={s.shield_slug} name={s.shield} /></li> : null}
            {!s.complete ? <li>{say("mls.inProgress")}</li> : null}
          </ul>
        </section>
      ) : null}
      {standings.length ? (
        <section className="section" id="tables">
          <h2>{say("mls.s.tables")}</h2>
          <MlsTables standings={standings} />
        </section>
      ) : null}
      {playoff.length ? (
        <section className="section" id="playoffs">
          <h2>{say("mls.s.playoffs")}</h2>
          <MlsPlayoffs matches={playoff} champion={s.champion_id} />
        </section>
      ) : null}
      {teams.length ? (
        <section className="section scroll" id="clubs">
          <h2>{say("mls.s.clubs")}</h2>
          <div className="tablebox"><SortTable {...teamTable} def="place.asc" param="sort_teams" /></div>
        </section>
      ) : null}
      {matches.length ? (
        <section className="section scroll" id="matches">
          <h2>{say("wc.t.matches")}</h2>
          <div className="tablebox"><SortTable {...matchTable} def="date.asc" param="sort_games" /></div>
          {s.complete && s.expected_regular != null && s.regular_matches < s.expected_regular ? <p className="note">{say("mls.s.incomplete", { found: s.regular_matches, expected: s.expected_regular })}</p> : null}
          {matches.some((m) => !m.venue_name) ? <p className="note">{say("mls.s.noVenues")}</p> : null}
        </section>
      ) : null}
      {hasBoards ? (
        <section className="section" id="leaders">
          <h2>{say("mls.s.leaders")}</h2>
          <div className="sc-two">
            {board("goals", say("mls.leaders.goals"), say("wc.col.goals"))}
            {board("assists", say("mls.leaders.assists"), say("mls.col.assists"))}
            {board("shutouts", say("mls.leaders.shutouts"), say("mls.col.shutouts"))}
          </div>
        </section>
      ) : null}
      {awards.length ? (
        <section className="section" id="awards">
          <h2>{say("wc.t.awards")}</h2>
          <ul className="sc-list">
            {awards.map((a) => (
              <li key={`${a.label}-${a.player_name}`}><b>{a.label}</b>: {a.player_name}{a.team_slug && a.team_name ? <> (<MlsClubName slug={a.team_slug} name={a.team_name} />)</> : null}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="section"><MlsCredit say={say} /></section>
    </div>
  );
});
