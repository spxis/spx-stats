import type { Metadata } from "next";
import Link from "next/link";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getSoccerTeams, getTeamRecords, getTournaments, type TeamRecord } from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { WORLDCUP_PATH } from "@/lib/soccerPath";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 86400;

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("wc.teams.title"), description: say("wc.teams.metaDesc"), path: "/worldcup/teams", locale });
});

/** Every national team that has played in a World Cup, with its record in the men's and in the women's tournament. */
export default guard(async function WorldCupTeamsPage() {
  const { say, fmt, locale } = await currentSpeaker();
  const [teams, records, tournaments] = await Promise.all([getSoccerTeams(), getTeamRecords(), getTournaments()]);
  const byId = new Map(teams.map((t) => [t.team_id, t]));
  const titles = (league: string) => {
    const n = new Map<string, number>();
    for (const t of tournaments) if (t.league === league && t.winner_team_id) n.set(t.winner_team_id, (n.get(t.winner_team_id) ?? 0) + 1);
    return n;
  };
  const table = (league: string) => {
    const won = titles(league);
    const list = records.filter((r) => r.league === league && byId.has(r.team_id));
    return tableOf(list, [
      {
        key: "team", label: say("col.team"), cls: "team", get: (r: TeamRecord) => { const t = byId.get(r.team_id)!; return teamName({ name: t.name, slug: t.slug, flag: t.flag_code }, locale); },
        cell: (r: TeamRecord) => { const t = byId.get(r.team_id)!; return <SoccerTeamName slug={t.slug} name={t.name} flag={t.flag_code} />; },
      },
      { key: "titles", label: say("wc.col.titles"), num: true, get: (r) => won.get(r.team_id) ?? 0, cell: (r) => won.get(r.team_id) ?? "" },
      { key: "tournaments", label: say("wc.col.tournaments"), num: true, get: (r) => r.tournaments },
      { key: "p", label: say("wc.col.played"), title: say("wc.col.playedTitle"), num: true, get: (r) => r.played },
      { key: "w", label: say("wc.col.w"), num: true, get: (r) => r.won },
      { key: "d", label: say("wc.col.d"), num: true, get: (r) => r.drawn },
      { key: "l", label: say("wc.col.l"), num: true, get: (r) => r.lost },
      { key: "gf", label: say("wc.col.gf"), title: say("wc.col.goalsForTitle"), num: true, get: (r) => r.goals_for, cell: (r) => fmt(r.goals_for) },
      { key: "ga", label: say("wc.col.ga"), title: say("wc.col.goalsAgainstTitle"), num: true, get: (r) => r.goals_against, cell: (r) => fmt(r.goals_against) },
    ], (r) => r.team_id);
  };
  const hasMen = records.some((r) => r.league === "wc"), hasWomen = records.some((r) => r.league === "wwc");
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("nav.soccer")}</span>
        <h1>{say("wc.teams.title")}</h1>
        <p className="lede">{say("wc.teams.lede")}</p>
        <p className="note"><Link href={WORLDCUP_PATH}>{say("wc.t.all")}</Link></p>
      </section>
      {hasMen ? (
        <section className="section scroll">
          <h2>{say("wc.mens")}</h2>
          <div className="tablebox"><SortTable {...table("wc")} def="titles.desc,w.desc" param="sort_men" /></div>
        </section>
      ) : null}
      {hasWomen ? (
        <section className="section scroll">
          <h2>{say("wc.womens")}</h2>
          <div className="tablebox"><SortTable {...table("wwc")} def="titles.desc,w.desc" param="sort_women" /></div>
        </section>
      ) : null}
      {!hasMen && !hasWomen ? <section className="section"><p className="note">{say("soccer.none")}</p></section> : null}
      <p className="note">{say("wc.teams.note")}</p>
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
