import type { Metadata } from "next";
import Link from "@/components/Link";
import { FamilyNav } from "@/components/FamilyNav";
import { MlsClubName } from "@/components/MlsClubName";
import { MlsCredit } from "@/components/MlsCredit";
import { SortTable } from "@/components/SortTable";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMlsAllTime, getMlsClubs, getMlsSeasons, type Season } from "@/lib/mls";
import { mlsMatchPath, mlsSeasonPath } from "@/lib/mlsPath";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 86400;

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("mls.title"), description: say("mls.metaDesc"), path: "/mls", locale });
});

/** Major League Soccer: every season with its Supporters' Shield and MLS Cup winners, and the clubs with their all-time regular-season record. A kept page: its tables sort in the browser. */
export default guard(async function MlsPage() {
  const { say, fmt, plural } = await currentSpeaker();
  const [seasons, clubs, allTime] = await Promise.all([getMlsSeasons(), getMlsClubs(), getMlsAllTime()]);
  const record = new Map(allTime.map((r) => [r.team_id, r]));
  const matches = seasons.reduce((n, s) => n + s.regular_matches + s.playoff_matches, 0);
  const goals = seasons.reduce((n, s) => n + s.regular_goals, 0);

  const seasonTable = tableOf(seasons, [
    { key: "year", label: say("wc.col.year"), num: true, get: (s) => s.year, cell: (s) => <Link href={mlsSeasonPath(s.year)} prefetch={false}>{s.year}</Link> },
    { key: "teams", label: say("wc.col.teams"), num: true, get: (s) => s.team_count },
    { key: "shield", label: say("mls.col.shield"), cls: "team", get: (s) => s.shield, cell: (s) => (s.shield && s.shield_slug ? <MlsClubName slug={s.shield_slug} name={s.shield} /> : "") },
    {
      key: "champion", label: say("mls.col.cup"), cls: "team", get: (s) => s.champion,
      cell: (s) => (s.champion && s.champion_slug ? <MlsClubName slug={s.champion_slug} name={s.champion} /> : s.complete ? "" : say("mls.inProgress")),
    },
    { key: "runnerup", label: say("wc.col.runnerUp"), cls: "team", get: (s) => s.runner_up, cell: (s) => (s.runner_up && s.runner_up_slug ? <MlsClubName slug={s.runner_up_slug} name={s.runner_up} /> : "") },
    { key: "final", label: say("wc.col.final"), get: (s) => (s.final_home_goals == null ? null : s.final_home_goals + (s.final_away_goals ?? 0)), cell: (s) => finalCell(s) },
    {
      key: "regular", label: say("mls.col.regular"), num: true, get: (s) => s.regular_matches,
      cell: (s) => (s.complete && s.expected_regular != null && s.regular_matches < s.expected_regular ? `${fmt(s.regular_matches)} / ${fmt(s.expected_regular)}` : fmt(s.regular_matches)),
    },
    { key: "playoffs", label: say("mls.col.playoffs"), num: true, get: (s) => s.playoff_matches, cell: (s) => fmt(s.playoff_matches) },
    { key: "goals", label: say("wc.col.goals"), num: true, get: (s) => s.regular_goals, cell: (s) => fmt(s.regular_goals) },
    { key: "crowd", label: say("mls.col.crowd"), title: say("mls.col.crowdTitle"), num: true, get: (s) => s.avg_attendance, cell: (s) => (s.avg_attendance == null ? "" : fmt(s.avg_attendance)) },
  ], (s) => s.tournament_id);

  function finalCell(s: Season) {
    if (s.final_match_id == null || s.final_home_goals == null || s.final_away_goals == null || !s.champion || !s.runner_up) return "";
    const home = s.final_home_id === s.champion_id ? s.champion : s.runner_up;
    const away = s.final_home_id === s.champion_id ? s.runner_up : s.champion;
    // shown from the champion's side (its goals first), whichever club the match lists as the home side
    const champHome = s.final_home_id === s.champion_id;
    const cg = champHome ? s.final_home_goals : s.final_away_goals, rg = champHome ? s.final_away_goals : s.final_home_goals;
    const cp = champHome ? s.final_home_penalties : s.final_away_penalties, rp = champHome ? s.final_away_penalties : s.final_home_penalties;
    const tail = s.final_shootout && cp != null && rp != null ? ` (${cp}–${rp})` : s.final_extra_time ? ` ${say("wc.aetShort")}` : "";
    return <Link href={mlsMatchPath(s.year, s.final_match_id, home, away)} prefetch={false}>{`${cg}–${rg}${tail}`}</Link>;
  }

  const clubTable = tableOf(clubs, [
    { key: "club", label: say("col.team"), cls: "team", get: (c) => c.name, cell: (c) => <MlsClubName slug={c.slug} name={c.latest_name ?? c.name} /> },
    { key: "years", label: say("mls.col.years"), get: (c) => c.first_year, cell: (c) => (c.first_year === c.last_year ? String(c.first_year) : `${c.first_year}–${c.last_year}`) },
    { key: "seasons", label: say("mls.col.seasons"), num: true, get: (c) => c.seasons },
    { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (c) => record.get(c.team_id)?.played ?? null, cell: (c) => fmt(record.get(c.team_id)?.played ?? 0) },
    { key: "w", label: say("wc.col.w"), num: true, get: (c) => record.get(c.team_id)?.won ?? null },
    { key: "d", label: say("wc.col.d"), num: true, get: (c) => record.get(c.team_id)?.drawn ?? null },
    { key: "l", label: say("wc.col.l"), num: true, get: (c) => record.get(c.team_id)?.lost ?? null },
    { key: "gf", label: say("wc.col.gf"), title: say("wc.col.goalsForTitle"), num: true, get: (c) => record.get(c.team_id)?.goals_for ?? null, cell: (c) => fmt(record.get(c.team_id)?.goals_for ?? 0) },
    { key: "ga", label: say("wc.col.ga"), title: say("wc.col.goalsAgainstTitle"), num: true, get: (c) => record.get(c.team_id)?.goals_against ?? null, cell: (c) => fmt(record.get(c.team_id)?.goals_against ?? 0) },
    { key: "pts", label: say("col.pts"), num: true, get: (c) => record.get(c.team_id)?.points ?? null, cell: (c) => fmt(record.get(c.team_id)?.points ?? 0) },
    { key: "cups", label: say("mls.col.cups"), title: say("mls.col.cupsTitle"), num: true, get: (c) => c.cups },
    { key: "shields", label: say("mls.col.shields"), title: say("mls.col.shieldsTitle"), num: true, get: (c) => c.shields },
  ], (c) => c.team_id);

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("nav.soccer")}</span>
        <h1>{say("mls.title")}</h1>
        <FamilyNav code="mls" />
        <p className="lede">{say("mls.lede")}</p>
      </section>
      {seasons.length ? (
        <>
          <Figures items={[
            [say("mls.figSeasons"), seasons.length], [say("mls.figClubs"), clubs.length], [say("soccer.matches"), matches], [say("soccer.goals"), goals],
          ]} />
          <section className="section scroll" id="seasons">
            <h2>{say("mls.seasons")}</h2>
            <div className="tablebox"><SortTable {...seasonTable} def="year.desc" param="sort_seasons" /></div>
            <p className="note">{say("mls.seasonsNote", { first: seasons[0].year, last: seasons.at(-1)!.year, n: plural("count.matches", matches) })}</p>
          </section>
          <section className="section scroll" id="clubs">
            <h2>{say("mls.clubs")}</h2>
            <div className="tablebox"><SortTable {...clubTable} def="pts.desc" param="sort_clubs" /></div>
            <p className="note">{say("mls.clubsNote")}</p>
          </section>
        </>
      ) : (
        <section className="section"><p className="note">{say("mls.none")}</p></section>
      )}
      <section className="section"><MlsCredit say={say} /></section>
    </div>
  );
});
