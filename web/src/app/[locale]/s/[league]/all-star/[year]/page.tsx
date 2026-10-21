import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { EventResult, MvpNames, Rosters, VenueName, eventName, listName } from "@/components/AllStar";
import { Credits } from "@/components/Credits";
import { getAllStar, getAllStarSelections } from "@/lib/allStar";
import { allStarPath, eventKey, partsOf, type AllStarEvent } from "@/lib/allStarView";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPlayerPaths } from "@/lib/playerLinks";
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

/** The All-Star Game(s) a league played in one calendar year: the facts, each game's result, the Most Valuable Player and the players picked. */
export default guard(async function AllStarYearPage({ params }: Props) {
  const { league: lg, year } = await params;
  const y = yearOf(year);
  if (!isLeague(lg) || y == null) notFound();
  const info = leagueInfo(lg)!;
  const { say, fmt, dt } = await currentSpeaker();
  const [data, lines, player] = await Promise.all([getAllStar(lg), getAllStarSelections(lg, y), getPlayerPaths()]);
  const events = data.events.filter((e) => e.year === y).sort((a, b) => a.event_no - b.event_no);
  if (!events.length) notFound();
  const years = [...new Set(data.events.map((e) => e.year))].sort((a, b) => a - b);
  const at = years.indexOf(y);
  const prev = at > 0 ? years[at - 1] : null, next = at < years.length - 1 ? years[at + 1] : null;
  const title = events.length > 1 ? say("allstar.events", { year: y, league: info.short }) : eventName(say, lg, info.short, y);
  const one = (ev: AllStarEvent) => {
    const { games, mvps } = partsOf(data, ev);
    const mine = lines.filter((l) => eventKey(l) === eventKey(ev));
    return (
      <section className="section" key={eventKey(ev)}>
        {events.length > 1 ? <h2>{eventName(say, lg, info.short, y)} ({ev.event_no})</h2> : null}
        <p className="lede"><EventResult ev={ev} games={games} say={say} /></p>
        {ev.format === "series" ? <p className="note">{say("allstar.format.series")}</p> : ev.format === "tournament" ? <p className="note">{say("allstar.format.tournament")}</p> : null}
        <dl className="pfacts">
          {ev.first_day ? <Fact label={say("allstar.fact.date")}>{dt.ymd(atUtc(ev.first_day))}{ev.last_day ? ` – ${dt.ymd(atUtc(ev.last_day))}` : ""}</Fact> : null}
          {ev.venue_name ? <Fact label={say("allstar.fact.venue")}><VenueName name={ev.venue_name} wid={ev.venue_wikidata_id} />{ev.city_text ? `, ${ev.city_text}` : ""}</Fact> : null}
          {ev.host_name ? <Fact label={say("allstar.fact.host")}>{ev.host_name}</Fact> : null}
          {ev.attendance != null ? <Fact label={say("allstar.fact.attendance")}>{fmt(ev.attendance)}</Fact> : null}
          {ev.season_year != null ? <Fact label={say("allstar.fact.season")}><Link href={seasonPath(lg, ev.season_year)}>{seasonLabel(lg, ev.season_year)}</Link></Fact> : null}
          {mvps.length ? <Fact label={say(mvps.length > 1 ? "allstar.fact.mvps" : "allstar.fact.mvp")}><MvpNames mvps={mvps} lg={lg} player={player} /></Fact> : null}
        </dl>
        {ev.status === "played" ? (
          <>
            <h3 className="rolehead">{say("allstar.rosters")}</h3>
            <Rosters lines={mine} lg={lg} say={say} player={player} />
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
      <p className="note"><Credits say={say} use={["wikipedia"]} /></p>
    </>
  );
});
