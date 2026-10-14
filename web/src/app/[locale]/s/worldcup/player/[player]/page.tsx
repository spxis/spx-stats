import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { positionBook } from "@/components/PositionKey";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { SortTable } from "@/components/SortTable";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { playerIdOf } from "@/lib/playerPath";
import { getPlayerTournaments, getSoccerTeams, soccerPerson } from "@/lib/soccer";
import { soccerPlayerPath, tournamentPath, WORLDCUP_PATH } from "@/lib/soccerPath";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 86400;

// Nothing is drawn at build time: each person is drawn on first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/worldcup/player/[player]">;

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { player } = await params;
  const id = playerIdOf(player);
  const p = id == null ? null : await soccerPerson(id);
  if (!p) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("wc.p.title", { name: p.name }), description: say("wc.p.metaDesc", { name: p.name }), path: soccerPlayerPath(p.person_id, p.name), locale });
});

/** A person's World Cup page: the tournaments they played in (squad, matches, goals, cards), or that they managed or refereed in. */
export default guard(async function SoccerPlayerPage({ params }: Params) {
  const { player } = await params;
  const id = playerIdOf(player);
  const p = id == null ? null : await soccerPerson(id);
  if (!p) notFound();
  const canonical = soccerPlayerPath(p.person_id, p.name);
  if (`/worldcup/player/${player}` !== canonical) permanentRedirect(canonical);
  const { say, dt, plural } = await currentSpeaker();
  const book = await positionBook();
  const [rows, teams] = await Promise.all([getPlayerTournaments(p.person_id), getSoccerTeams()]);
  const flag = new Map(teams.map((t) => [t.team_id, t.flag_code]));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const table = tableOf(rows, [
    { key: "year", label: say("wc.col.year"), num: true, get: (r) => r.year, cell: (r) => <Link href={tournamentPath(r.year)} prefetch={false}>{r.year}</Link> },
    { key: "comp", label: say("wc.col.competition"), cls: "team", get: (r) => r.league, cell: (r) => say(r.league === "wwc" ? "wc.womens" : "wc.mens") },
    { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team, cell: (r) => <SoccerTeamName slug={r.team_slug} name={r.team} flag={flag.get(r.team_id)} /> },
    { key: "no", label: say("wc.col.no"), num: true, get: (r) => r.shirt_number },
    { key: "pos", label: say("wc.col.position"), get: (r) => r.position_code, cell: (r) => book.code(r.position_code, ["soccer"]) },
    { key: "p", label: say("wc.col.played"), num: true, get: (r) => r.played },
    { key: "s", label: say("wc.col.started"), num: true, get: (r) => r.started },
    { key: "g", label: say("wc.col.goals"), num: true, get: (r) => r.goals },
    { key: "y", label: say("wc.col.yellow"), num: true, get: (r) => r.yellow },
    { key: "r", label: say("wc.col.red"), num: true, get: (r) => r.red },
  ], (r) => r.tournament_id);
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("wc.p.eyebrow")}</span>
        <h1>{p.name}</h1>
        <p className="lede">
          {p.birth_date ? say("wc.p.born", { date: dt.ymd(new Date(p.birth_date)) }) : ""}
        </p>
        <p className="note"><Link href={WORLDCUP_PATH}>{say("wc.t.all")}</Link></p>
      </section>
      {rows.length ? (
        <>
          <Figures items={[
            [say("wc.col.tournaments"), rows.length], [say("wc.col.played"), sum((r) => r.played)], [say("wc.col.goals"), sum((r) => r.goals)],
            [say("wc.col.yellow"), sum((r) => r.yellow)], [say("wc.col.red"), sum((r) => r.red)],
          ]} />
          <section className="section scroll">
            <h2>{say("wc.p.tournaments")}</h2>
            <div className="tablebox"><SortTable {...table} def="year.asc" /></div>
            <p className="note">{say("wc.p.note")}</p>
          </section>
        </>
      ) : null}
      {p.managed ? <section className="section"><p>{say("wc.p.managed", { n: plural("count.tournaments", p.managed) })}</p></section> : null}
      {!rows.length && !p.managed ? <section className="section"><p>{say("wc.p.refereed")}</p></section> : null}
      {book.key()}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
