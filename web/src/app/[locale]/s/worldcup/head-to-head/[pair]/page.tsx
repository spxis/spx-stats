import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { SortTable } from "@/components/SortTable";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMeetings, teamBySlug, type Match, type SoccerTeam } from "@/lib/soccer";
import { goalsOf, H2H_PATH, h2hPath, splitPair, summarize } from "@/lib/soccerH2H";
import { teamName } from "@/lib/soccerNames";
import { soccerMatchPath, soccerTeamPath, tournamentPath, WORLDCUP_PATH } from "@/lib/soccerPath";
import { groupLabel, scoreLines, stageName } from "@/lib/soccerView";
import { tableOf } from "@/lib/sort";
import "@/components/soccer.css";

export const revalidate = 2592000;

// Nothing is drawn at build time: each pairing is drawn on its first visit, then kept and revalidated like the rest (the sitemap lists the pairs that have met).
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/worldcup/head-to-head/[pair]">;

/** The two teams of an address and every World Cup match between them; null when the address is no pairing that has met. */
async function find(pair: string): Promise<{ a: SoccerTeam; b: SoccerTeam; meetings: Match[] } | null> {
  const slugs = splitPair(pair);
  if (!slugs) return null;
  const [x, y] = await Promise.all([teamBySlug(slugs[0]), teamBySlug(slugs[1])]);
  if (!x || !y) return null;
  const [a, b] = x.slug <= y.slug ? [x, y] : [y, x];
  const meetings = await getMeetings(a.team_id, b.team_id);
  return meetings.length ? { a, b, meetings } : null;
}

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { pair } = await params;
  const found = await find(pair);
  if (!found) return {};
  const { say, locale } = await currentSpeaker();
  const a = teamName({ name: found.a.name, slug: found.a.slug, flag: found.a.flag_code }, locale);
  const b = teamName({ name: found.b.name, slug: found.b.slug, flag: found.b.flag_code }, locale);
  return pageMeta({ title: say("wc.h2h.title", { a, b }), description: say("wc.h2h.metaDesc", { a, b }), path: h2hPath(found.a.slug, found.b.slug), locale });
});

/**
 * Every World Cup meeting of two national teams: the men's and the women's tournaments in sections of their own, each with the record (a match decided
 * on penalties counts as a draw and is noted), the goals, the widest wins, the first and last meeting, the stages met in and the matches. Worked out
 * from api.soccer_matches (lib/soccerH2H.ts). The address has the two slugs in alphabetical order; the other order redirects to it.
 */
export default guard(async function HeadToHeadPage({ params }: Params) {
  const { pair } = await params;
  const found = await find(pair);
  if (!found) notFound();
  const { a, b, meetings } = found;
  const canonical = h2hPath(a.slug, b.slug);
  if (`${H2H_PATH}/${pair}` !== canonical) permanentRedirect(canonical);
  const { say, fmt, dt, locale, plural } = await currentSpeaker();
  const nameA = teamName({ name: a.name, slug: a.slug, flag: a.flag_code }, locale);
  const nameB = teamName({ name: b.name, slug: b.slug, flag: b.flag_code }, locale);
  const nameOf = (id: string) => (id === a.team_id ? nameA : nameB);
  const day = (iso: string) => dt.ymd(new Date(iso));
  const sections = (["wc", "wwc"] as const).map((league) => ({ league, list: meetings.filter((m) => m.league === league) })).filter((s) => s.list.length);

  /** One match as a line: year, stage, the teams and the score, opening the match. */
  const line = (m: Match) => {
    const s = scoreLines(say, m);
    return (
      <Link href={soccerMatchPath(m.year, m.match_id, m.home, m.away)} prefetch={false}>
        {m.year} · {groupLabel(say, m)}: {nameOf(m.home_team_id)} {s.main} {nameOf(m.away_team_id)}{s.note ? ` (${s.note})` : ""}
      </Link>
    );
  };

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("wc.h2h.eyebrow")}</span>
        <h1>{nameA} {say("wc.h2h.vs")} {nameB}</h1>
        <p className="lede">{say("wc.h2h.lede", { a: nameA, b: nameB, matches: plural("count.matches", meetings.length) })}</p>
        <p className="note"><Link href={WORLDCUP_PATH}>{say("wc.t.all")}</Link></p>
      </section>
      {/* Where kyogijo's coming round team mark and `roadToFinal` plug in (board ticket cmv7f4bq50007l9060dnvj3qo, waits for the next kyogijo version; not built
          here): the two large round flags below are the marks it would draw, and a pairing that met in a final is where a road to the final starts. */}
      <section className="sc-board" aria-label={say("wc.h2h.eyebrow")}>
        <div className="side"><span className="nm"><SoccerTeamName slug={a.slug} name={a.name} flag={a.flag_code} large /></span></div>
        <div className="mid"><div className="big">{say("wc.h2h.vs")}</div><div className="sub">{plural("count.matches", meetings.length)}</div></div>
        <div className="side away"><span className="nm"><SoccerTeamName slug={b.slug} name={b.name} flag={b.flag_code} large /></span></div>
      </section>
      {sections.map(({ league, list }) => {
        const s = summarize(list, a.team_id, b.team_id);
        const shootouts = s.aShootoutWins + s.bShootoutWins;
        const table = tableOf(list, [
          { key: "year", label: say("wc.col.year"), num: true, get: (m) => m.match_date, cell: (m) => <Link href={tournamentPath(m.year)} prefetch={false}>{m.year}</Link> },
          { key: "stage", label: say("wc.col.stage"), get: (m) => m.stage_order, cell: (m) => groupLabel(say, m) },
          { key: "home", label: say("col.home"), cls: "team", get: (m) => m.home, cell: (m) => <SoccerTeamName slug={m.home_slug} name={m.home} flag={m.home_flag} /> },
          {
            key: "score", label: say("col.score"), get: (m) => m.home_goals + m.away_goals,
            cell: (m) => {
              const sc = scoreLines(say, m);
              return <Link className="sc-score" href={soccerMatchPath(m.year, m.match_id, m.home, m.away)} prefetch={false}>{sc.main}{sc.note ? <small>{sc.note}</small> : null}</Link>;
            },
          },
          { key: "away", label: say("wc.col.away"), cls: "team", get: (m) => m.away, cell: (m) => <SoccerTeamName slug={m.away_slug} name={m.away} flag={m.away_flag} /> },
        ], (m) => m.match_id);
        const biggest = (m: Match | null, id: string) => {
          if (!m) return null;
          const [f, g] = goalsOf(m, id);
          return <li key={id}><b>{say("wc.h2h.biggest", { team: nameOf(id) })}</b> {line(m)} <span className="note">({f}–{g})</span></li>;
        };
        return (
          <section className="section scroll" key={league} id={league === "wc" ? "men" : "women"}>
            <h2>{say(league === "wwc" ? "wc.womens" : "wc.mens")}</h2>
            <Figures items={[
              [say("wc.h2h.wins", { team: nameA }), s.aWins], [say("wc.h2h.draws"), s.draws], [say("wc.h2h.wins", { team: nameB }), s.bWins],
              [say("wc.h2h.goals"), `${fmt(s.aGoals)}–${fmt(s.bGoals)}`],
            ]} />
            {shootouts ? <p className="note">{say("wc.h2h.pensNote", { n: shootouts, a: nameA, x: s.aShootoutWins, b: nameB, y: s.bShootoutWins })}</p> : null}
            <ul className="sc-list">
              {s.first ? <li><b>{say("wc.h2h.first")}</b> {line(s.first)} <span className="note">({day(s.first.match_date)})</span></li> : null}
              {s.last && s.last !== s.first ? <li><b>{say("wc.h2h.last")}</b> {line(s.last)} <span className="note">({day(s.last.match_date)})</span></li> : null}
              {biggest(s.biggestA, a.team_id)}
              {biggest(s.biggestB, b.team_id)}
              <li><b>{say("wc.h2h.stages")}</b> {s.stages.map((k) => stageName(say, k)).join(", ")}</li>
            </ul>
            <h3>{say("wc.h2h.meetings")}</h3>
            <div className="tablebox"><SortTable {...table} def="year.asc" param={league === "wwc" ? "sort_women" : "sort_men"} /></div>
          </section>
        );
      })}
      <p className="note">{say("wc.teams.note")}</p>
      <section className="section">
        <p className="note"><Link href={soccerTeamPath(a.slug)}>{nameA}</Link> · <Link href={soccerTeamPath(b.slug)}>{nameB}</Link></p>
        <SoccerCredit say={say} />
      </section>
    </div>
  );
});
