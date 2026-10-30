import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { positionBook } from "@/components/PositionKey";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerGroups } from "@/components/SoccerGroups";
import { SoccerKnockout } from "@/components/SoccerKnockout";
import { TeamStrip } from "@/components/TeamStrip";
import { WcMatchesTable, WcScorersTable, WcTeamsTable } from "@/components/WcTables";
import { TournamentMap } from "@/components/TournamentMap";
import { SoccerRoad } from "@/components/SoccerRoad";
import { SoccerSquads } from "@/components/SoccerSquads";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { SortTable } from "@/components/SortTable";
import { StadiumName } from "@/components/StadiumName";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import {
  getAwards, getSoccerTeams, getSquads, getStandings, getTopScorers, getTournamentMatches, getTournamentTeams, tournamentOfYear,
} from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { isYearSeg, soccerPlayerPath, tournamentPath, WORLDCUP_PATH } from "@/lib/soccerPath";
import { stripTeams } from "@/lib/soccerStrip";
import { tableOf } from "@/lib/sort";
import { buildWcMatches, buildWcScorers, buildWcTeams, wcTablesPath } from "@/lib/wcLines";
import { stripLines } from "@/lib/wcStrip";
import { PlaceMedal } from "@/components/PlaceMedal";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each tournament is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/worldcup/[year]">): Promise<Metadata> => {
  const { year } = await params;
  if (!isYearSeg(year)) return {};
  const t = await tournamentOfYear(Number(year));
  if (!t) return {};
  const { say, locale } = await currentSpeaker();
  const title = say(t.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: t.year });
  return pageMeta({
    title,
    description: say("wc.t.metaDesc", { title, champion: t.winner ?? "", matches: t.matches, goals: t.goals }),
    path: tournamentPath(t.year),
    locale,
  });
});

export default guard(async function TournamentPage({ params }: PageProps<"/[locale]/s/worldcup/[year]">) {
  const { year } = await params;
  if (!isYearSeg(year)) notFound();
  const t = await tournamentOfYear(Number(year));
  if (!t) notFound();
  const { say, fmt, dt, locale } = await currentSpeaker();
  const book = await positionBook();
  const [teams, matches, standings, scorers, awards, squads, allTeams] = await Promise.all([
    getTournamentTeams(t.tournament_id), getTournamentMatches(t.tournament_id), getStandings(t.tournament_id), getTopScorers(t.tournament_id),
    getAwards(t.tournament_id), getSquads(t.tournament_id), getSoccerTeams(),
  ]);
  const byId = new Map(allTeams.map((x) => [x.team_id, x]));
  const title = say(t.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: t.year });
  const hosts = t.host_team_ids.map((id, i) => {
    const h = byId.get(id);
    return h ? teamName({ name: h.name, slug: h.slug, flag: h.flag_code }, locale) : (t.host_names[i] ?? id);
  }).join(", ");
  const day = (iso: string) => dt.ymd(new Date(iso));
  const dates = t.start_date && t.end_date ? `${day(t.start_date)} – ${day(t.end_date)}` : null;
  const knockout = matches.filter((m) => m.stage_order >= 4);
  const per = t.matches ? Math.round((t.goals / t.matches) * 100) / 100 : 0;

  // stadiums as the source names them; the name links to /venue/Q<venue_wikidata_id> (that route redirects to the venue's own address) when the
  // world stadium dataset holds the ground (venue_id), else it is plain text.
  const stadiums = [...matches.reduce((map, m) => {
    if (!m.venue_name) return map;
    const key = `${m.venue_name}|${m.venue_city ?? ""}`;
    const e = map.get(key) ?? { name: m.venue_name, city: m.venue_city, country: m.venue_country, qid: m.venue_wikidata_id, linked: m.venue_id != null, n: 0 };
    e.n += 1;
    return map.set(key, e);
  }, new Map<string, { name: string; city: string | null; country: string | null; qid: string | null; linked: boolean; n: number }>()).values()];
  const stadiumTable = tableOf(stadiums, [
    { key: "name", label: say("col.venue"), cls: "team", get: (s) => s.name, cell: (s) => <StadiumName name={s.name} qid={s.qid} linked={s.linked} /> },
    { key: "city", label: say("wc.col.city"), cls: "team", get: (s) => s.city, cell: (s) => [s.city, s.country].filter(Boolean).join(", ") },
    { key: "n", label: say("wc.col.matches"), num: true, get: (s) => s.n },
  ], (s) => s.name);

  // the place leads each row so the first three get their medal
  const podium: [number, string, string | null, string | null, string | null][] = [
    [1, say("wc.reach.champions"), t.winner, t.winner_slug, t.winner_flag],
    [2, say("wc.reach.runnerUp"), t.runner_up, t.runner_up_slug, t.runner_up_flag],
  ];
  const third = teams.find((x) => x.final_position === 3), fourth = teams.find((x) => x.final_position === 4);
  if (third) podium.push([3, say("wc.reach.third"), third.team, third.team_slug, third.flag_code]);
  if (fourth) podium.push([4, say("wc.reach.fourth"), fourth.team, fourth.team_slug, fourth.flag_code]);

  // The strip under the heading and the map in its corner: every team, each pointing at its squad further down (`#squad-<code>`).
  const withSquad = new Set(squads.map((x) => x.team_id));
  const strip = stripTeams(teams, say, (x) => teamName({ name: x.team, slug: x.team_slug, flag: x.flag_code }, locale), (id) => withSquad.has(id));
  const squadAnchors = new Map(strip.map((x) => [x.id, x.anchor]));

  const awardGroups = [...new Set(awards.map((a) => a.award))];

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say(t.league === "wwc" ? "wc.womens" : "wc.mens")}</span>
        <h1>{title}</h1>
        <p className="lede">{say("wc.t.lede", { hosts, dates: dates ?? String(t.year) })}</p>
        <p className="note"><Link href={WORLDCUP_PATH}>{say("wc.t.all")}</Link></p>
        {strip.length ? <TournamentMap teams={strip} title={title} /> : null}
      </section>
      <TeamStrip teams={stripLines(strip)} title={title} />
      <Figures items={[
        [say("wc.col.teams"), t.team_count ?? teams.length], [say("wc.col.matches"), t.matches], [say("wc.col.goals"), t.goals], [say("wc.t.perMatch"), fmt(per)],
      ]} />
      {t.winner && t.winner_slug ? (
        <section className="section">
          <h2>{say("wc.t.result")}</h2>
          <ul className="sc-list">
            {podium.filter((p) => p[2] && p[3]).map(([place, label, name, slug, flag]) => (
              <li key={label}>{place <= 3 ? <PlaceMedal place={place} /> : null}<b>{label}</b> <SoccerTeamName slug={slug!} name={name!} flag={flag} /></li>
            ))}
          </ul>
        </section>
      ) : null}
      {standings.length ? (
        <section className="section" id="groups">
          <h2>{say("wc.t.groups")}</h2>
          <SoccerGroups standings={standings} />
        </section>
      ) : null}
      {knockout.length ? (
        <section className="section" id="knockout">
          <h2>{say("wc.t.knockout")}</h2>
          <SoccerKnockout matches={knockout} year={t.year} />
        </section>
      ) : null}
      <SoccerRoad matches={matches} year={t.year} league={t.league} />
      {teams.length ? (
        <section className="section scroll" id="teams">
          <h2>{say("wc.t.teams")}</h2>
          <WcTeamsTable lines={buildWcTeams(teams)} hrefAll={`${wcTablesPath(t.year)}#teams`} />
        </section>
      ) : null}
      {matches.length ? (
        <section className="section scroll" id="matches">
          <h2>{say("wc.t.matches")}</h2>
          <WcMatchesTable year={t.year} wire={buildWcMatches(matches)} hrefAll={`${wcTablesPath(t.year)}#matches`} />
          {matches.some((m) => m.lineup_players === 0) ? <p className="note">{say("wc.t.noLineups")}</p> : null}
        </section>
      ) : null}
      {scorers.length ? (
        <section className="section scroll" id="scorers">
          <h2>{say("wc.t.scorers")}</h2>
          <WcScorersTable lines={buildWcScorers(scorers)} hrefAll={`${wcTablesPath(t.year)}#scorers`} />
          {scorers.some((s) => s.person_id == null) ? <p className="note">{say("wc.t.scorerNamesOnly")}</p> : null}
        </section>
      ) : null}
      {awardGroups.length ? (
        <section className="section" id="awards">
          <h2>{say("wc.t.awards")}</h2>
          <ul className="sc-list">
            {awardGroups.map((name) => (
              <li key={name}><b>{name}</b>: {awards.filter((a) => a.award === name).map((a, i) => (
                <span key={a.person_id}>{i ? ", " : ""}<Link href={soccerPlayerPath(a.person_id, a.player)} prefetch={false}>{a.player}</Link>{a.team ? <> (<SoccerTeamName slug={a.team_slug ?? ""} name={a.team} flag={allTeams.find((x) => x.team_id === a.team_id)?.flag_code} />)</> : null}</span>
              ))}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {stadiums.length ? (
        <section className="section scroll" id="stadiums">
          <h2>{say("wc.t.stadiums")}</h2>
          <div className="tablebox"><SortTable {...stadiumTable} def="n.desc" param="sort_venues" /></div>
        </section>
      ) : null}
      {squads.length ? (
        <section className="section" id="squads">
          <h2>{say("wc.t.squads")}</h2>
          <SoccerSquads squads={squads} flags={new Map(allTeams.map((x) => [x.team_id, x.flag_code]))} book={book} anchors={squadAnchors} />
        </section>
      ) : null}
      {book.key()}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
