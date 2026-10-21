import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { AllStarBracket } from "@/components/AllStarBracket";
import { GameStrip, HostClub, MvpNames, SideHeading, VenueName, boardLabel, byWord, eventName, formatLine, listName, looksStyle, stageName } from "@/components/AllStar";
import { Rosters } from "@/components/AllStarRosters";
import { positionBook } from "@/components/PositionKey";
import { Showdown, type ShowdownSide } from "@/components/Showdown";
import { TeamLogo } from "@/components/TeamLogo";
import { Credits } from "@/components/Credits";
import { getAllStar, getAllStarSelections, getClubs } from "@/lib/allStar";
import { allStarPath, eventKey, partsOf, realGames, reasonOf, shapeOf, type AllStarEvent } from "@/lib/allStarView";
import { resultOf, type ResultView } from "@/lib/allStarResult";
import type { SideView } from "@/lib/allStarSides";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPlayerPaths } from "@/lib/playerLinks";
import { getPaths } from "@/lib/teamSlugs";
import { seasonPath } from "@/lib/slug";
import "@/components/people.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/all-star/[year]">;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pfact"><dt>{label}</dt><dd>{children}</dd></div>;
}

const yearOf = (seg: string): number | null => (/^\d{4}$/.test(seg) ? Number(seg) : null);

export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const { league, year } = await params;
  const y = yearOf(year);
  const info = isLeague(league) ? leagueInfo(league) : null;
  if (!info || y == null) return {};
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: eventName(say, league, info.short, y), description: say("allstar.metaEvent", { event: eventName(say, league, info.short, y) }), path: allStarPath(league, y), locale });
});

/** The All-Star Game(s) a league played in one calendar year: the two sides as a banner (a tournament as its bracket), the facts, the Most Valuable Player and the players picked. */
export default guard(async function AllStarYearPage({ params }: Props) {
  const { league: lg, year } = await params;
  const y = yearOf(year);
  if (!isLeague(lg) || y == null) notFound();
  const info = leagueInfo(lg)!;
  const { say, fmt, dt } = await currentSpeaker();
  const [data, lines, player, clubs, paths, book] = await Promise.all([getAllStar(lg), getAllStarSelections(lg, y), getPlayerPaths(), getClubs(lg), getPaths(), positionBook()]);
  const events = data.events.filter((e) => e.year === y).sort((a, b) => a.event_no - b.event_no);
  if (!events.length) notFound();
  const years = [...new Set(data.events.map((e) => e.year))].sort((a, b) => a - b);
  const at = years.indexOf(y);
  const prev = at > 0 ? years[at - 1] : null, next = at < years.length - 1 ? years[at + 1] : null;
  const title = events.length > 1 ? say("allstar.events", { year: y, league: info.short }) : eventName(say, lg, info.short, y);

  const banner = (ev: AllStarEvent, res: ResultView) => {
    const season = ev.season_year;
    const side = (s: SideView, i: 0 | 1): ShowdownSide => ({
      crest: s.logo ? <TeamLogo url={s.logo} size={88} shape="circle" /> : <span className="crest"><span className="mono">{s.mono}</span></span>,
      name: <SideHeading href={s.f != null && season != null ? paths.teamSeason(lg, s.f, season) : null} name={s.name} />,
      tag: res.winner === i ? say("gm.winnerTag") : null,
      meta: [s.f != null && s.f === ev.host_franchise ? say("allstar.fact.host") : null].filter((x): x is string => !!x),
      links: s.f != null && season != null ? [
        <Link key="season" href={paths.teamSeason(lg, s.f, season)} prefetch={false}>{say("gm.teamSeason", { season: seasonLabel(lg, season) })}</Link>,
        <Link key="all" href={paths.team(lg, s.f)} prefetch={false}>{say("gm.teamAll")}</Link>,
      ] : [],
      lost: res.winner != null && res.winner !== i,
    });
    const winner = res.winner == null ? null : res.winner === 0 ? res.left : res.right;
    const notes = [stageName(say, res.stage), byWord(say, res.by), formatLine(say, res.shape, res.games), ev.first_day ? dt.ymd(atUtc(ev.first_day)) : null].filter((x): x is string => !!x);
    return (
      <div style={looksStyle(res.looks[0], res.looks[1])}>
        <Showdown
          label={eventName(say, lg, info.short, y)} a={side(res.left, 0)} b={side(res.right, 1)} winner={res.winner} level={res.winner == null}
          score={[res.left.score, res.right.score]} scoreLabel={boardLabel(res)}
          verdict={winner ? <>{winner.logo ? <TeamLogo url={winner.logo} size={36} shape="circle" /> : null}{say("gm.won", { team: winner.name })}</> : say("gm.tied")}
          notes={notes}
        />
      </div>
    );
  };

  const one = (ev: AllStarEvent) => {
    const { games, mvps } = partsOf(data, ev);
    const mine = lines.filter((l) => eventKey(l) === eventKey(ev));
    const res = resultOf(lg, clubs, ev, games);
    const list = realGames(games);
    return (
      <section className="section asevent" key={eventKey(ev)}>
        {events.length > 1 ? <h2>{eventName(say, lg, info.short, y)} ({ev.event_no})</h2> : null}
        {ev.status === "cancelled" ? <p className="lede">{say("allstar.notHeldWhy", { reason: say(`allstar.reason.${reasonOf(ev.status_reason)}`) })}</p> : null}
        {res ? banner(ev, res) : null}
        {res?.shape === "bracket" ? (
          <>
            <h3 className="rolehead">{say("allstar.head.tournament")}</h3>
            <div className="asbracket"><AllStarBracket lg={lg} year={y} games={games} /></div>
          </>
        ) : null}
        {res && (res.shape === "series" || res.shape === "games") ? (
          <>
            <h3 className="rolehead">{say(res.shape === "series" ? "allstar.head.series" : "allstar.head.games")}</h3>
            <div className="asstrips">{list.map((g) => <GameStrip key={g.game_no} lg={lg} g={g} host={ev.host_franchise} year={ev.season_year} look={clubs} say={say} />)}</div>
          </>
        ) : null}
        <dl className="pfacts">
          {ev.first_day ? <Fact label={say("allstar.fact.date")}>{dt.ymd(atUtc(ev.first_day))}{ev.last_day ? ` – ${dt.ymd(atUtc(ev.last_day))}` : ""}</Fact> : null}
          {ev.venue_name ? <Fact label={say("allstar.fact.venue")}><VenueName name={ev.venue_name} wid={ev.venue_wikidata_id} />{ev.city_text ? `, ${ev.city_text}` : ""}</Fact> : null}
          {ev.host_name ? <Fact label={say("allstar.fact.host")}><HostClub lg={lg} ev={ev} clubs={clubs} /></Fact> : null}
          {ev.attendance != null ? <Fact label={say("allstar.fact.attendance")}>{fmt(ev.attendance)}</Fact> : null}
          {ev.season_year != null ? <Fact label={say("allstar.fact.season")}><Link href={seasonPath(lg, ev.season_year)}>{seasonLabel(lg, ev.season_year)}</Link></Fact> : null}
          {mvps.length ? <Fact label={say(mvps.length > 1 ? "allstar.fact.mvps" : "allstar.fact.mvp")}><MvpNames mvps={mvps} lg={lg} player={player} clubs={clubs} season={ev.season_year} /></Fact> : null}
        </dl>
        {ev.status === "played" ? (
          <>
            <h3 className="rolehead">{say("allstar.rosters")}</h3>
            <Rosters lines={mine} lg={lg} say={say} player={player} clubs={clubs} season={ev.season_year} id={`as${ev.event_no}`} book={book} />
            {mine.length ? <p className="note">{say("allstar.rostersNote")}</p> : null}
          </>
        ) : null}
      </section>
    );
  };
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <span className="eyebrow"><Link href={allStarPath(lg)}>{listName(say, lg, info.short)}</Link></span>
        <h1>{title}</h1>
        <p className="note">
          {prev != null ? <Link href={allStarPath(lg, prev)}>{"← "}{prev}</Link> : null}
          {prev != null && next != null ? " · " : null}
          {next != null ? <Link href={allStarPath(lg, next)}>{next}{" →"}</Link> : null}
          {prev != null || next != null ? " · " : null}
          <Link href={allStarPath(lg)}>{say("allstar.back", { league: info.short })}</Link>
        </p>
      </section>
      {events.map(one)}
      {book.key()}
      <p className="note"><Credits say={say} use={events.some((e) => shapeOf(e, partsOf(data, e).games) === "bracket") ? ["wikipedia", "brackets"] : ["wikipedia"]} /></p>
    </>
  );
});
