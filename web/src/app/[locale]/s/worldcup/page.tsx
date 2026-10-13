import type { Metadata } from "next";
import Link from "next/link";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getSoccerTeams, getTournaments, type Tournament } from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { soccerMatchPath, soccerPlayerPath, tournamentPath, WORLDCUP_TEAMS_PATH } from "@/lib/soccerPath";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 3600;

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("wc.title"), description: say("wc.metaDesc"), path: "/worldcup", locale });
});

/** Every World Cup, men's and women's: host, champion, runner-up, the final and the top scorer. A kept page: its tables sort in the browser. */
export default guard(async function WorldCupPage() {
  const { say, fmt, locale } = await currentSpeaker();
  const [all, teams] = await Promise.all([getTournaments(), getSoccerTeams()]);
  const byId = new Map(teams.map((t) => [t.team_id, t]));
  const hostsOf = (t: Tournament) => t.host_team_ids.map((id, i) => {
    const h = byId.get(id);
    return h ? teamName({ name: h.name, slug: h.slug, flag: h.flag_code }, locale) : (t.host_names[i] ?? id);
  }).join(", ");
  const table = (list: Tournament[]) => tableOf(list, [
    { key: "year", label: say("wc.col.year"), num: true, get: (t) => t.year, cell: (t) => <Link href={tournamentPath(t.year)} prefetch={false}>{t.year}</Link> },
    { key: "host", label: say("wc.col.host"), get: (t) => t.host_names.join(", "), cell: (t) => hostsOf(t) },
    { key: "champion", label: say("col.champion"), cls: "team", get: (t) => t.winner,
      cell: (t) => (t.winner && t.winner_slug ? <SoccerTeamName slug={t.winner_slug} name={t.winner} flag={t.winner_flag} /> : "") },
    { key: "runnerup", label: say("wc.col.runnerUp"), cls: "team", get: (t) => t.runner_up,
      cell: (t) => (t.runner_up && t.runner_up_slug ? <SoccerTeamName slug={t.runner_up_slug} name={t.runner_up} flag={t.runner_up_flag} /> : "") },
    {
      key: "final", label: say("wc.col.final"), cls: "team", get: (t) => (t.final_home_goals == null ? null : t.final_home_goals + (t.final_away_goals ?? 0)),
      cell: (t) => {
        if (t.final_match_id == null || t.final_home_goals == null || t.final_home == null || t.final_away == null) return say("wc.noFinal");
        const pens = t.final_shootout && t.final_home_penalties != null ? ` (${t.final_home_penalties}–${t.final_away_penalties})` : t.final_extra_time ? ` ${say("wc.aetShort")}` : "";
        return <Link href={soccerMatchPath(t.year, t.final_match_id, t.final_home, t.final_away)} prefetch={false}>{`${t.final_home_goals}–${t.final_away_goals}${pens}`}</Link>;
      },
    },
    {
      key: "scorer", label: say("wc.col.topScorer"), get: (t) => t.top_goals,
      cell: (t) => {
        if (!t.top_scorers?.length || t.top_goals == null) return "";
        const ids = t.top_person_ids ?? [];
        return <>{t.top_scorers.map((n, i) => (
          <span key={n + i}>{i ? ", " : ""}{ids[i] != null ? <Link href={soccerPlayerPath(ids[i]!, n)} prefetch={false}>{n}</Link> : n}</span>
        ))} ({t.top_goals})</>;
      },
    },
    { key: "teams", label: say("wc.col.teams"), num: true, get: (t) => t.team_count, cell: (t) => (t.team_count == null ? "" : fmt(t.team_count)) },
    { key: "matches", label: say("wc.col.matches"), num: true, get: (t) => t.matches, cell: (t) => fmt(t.matches) },
    { key: "goals", label: say("wc.col.goals"), num: true, get: (t) => t.goals, cell: (t) => fmt(t.goals) },
  ], (t) => t.tournament_id);
  const men = all.filter((t) => t.league === "wc");
  const women = all.filter((t) => t.league === "wwc");
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("nav.soccer")}</span>
        <h1>{say("wc.title")}</h1>
        <p className="lede">{say("wc.lede")}</p>
        <p className="note"><Link href={WORLDCUP_TEAMS_PATH}>{say("soccer.teamsLink")}</Link></p>
      </section>
      {all.length ? (
        <>
          {men.length ? (
            <section className="section" id="men">
              <h2>{say("wc.mens")}</h2>
              <div className="tablebox"><SortTable {...table(men)} def="year.desc" param="sort_men" /></div>
            </section>
          ) : null}
          {women.length ? (
            <section className="section" id="women">
              <h2>{say("wc.womens")}</h2>
              <div className="tablebox"><SortTable {...table(women)} def="year.desc" param="sort_women" /></div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="section"><p className="note">{say("soccer.none")}</p></section>
      )}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
