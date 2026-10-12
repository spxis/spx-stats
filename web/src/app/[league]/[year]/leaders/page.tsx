import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { LeaderSeasonSelect } from "@/components/LeaderSeasonSelect";
import { PlayerLeaders } from "@/components/PlayerLeaders";
import { TeamLeaders } from "@/components/TeamLeaders";
import { NoSeason } from "@/components/ui";
import { queryHref } from "@/components/ViewTabs";
import { getAbbrs, getBrands, getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { cleanSeasons, leadersPath } from "@/lib/leaderStats";
import { PLAYER_SPECS } from "@/lib/leaderPlayers";
import { getLeagueStandings } from "@/lib/leadersData";
import { pageMeta } from "@/lib/meta";
import { leagueSat } from "@/lib/noSeason";
import { parseSeasonSeg, seasonPath, withQuery } from "@/lib/slug";
import "@/components/alignment.css";
import "@/components/leaders.css";
import { guard, guardMeta } from "@/lib/loadGuard";

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[league]/[year]/leaders">): Promise<Metadata> => {
  const { league, year } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  if (!isLeague(league) || !ys) return {};
  const { seasons } = await getSummary();
  if (!seasons.some((s) => s.league === league && s.year === ys.y && !leagueSat(s))) return { robots: { index: false } };
  const { say, locale } = await currentSpeaker();
  const label = seasonLabel(league, ys.y);
  return pageMeta({
    title: say("leaders.metaTitle", { label, league: LG[league] }),
    description: say(PLAYER_SPECS[league] ? "leaders.metaDesc" : "leaders.metaDescTeams", { label, league: LG[league] }),
    path: leadersPath(league, ys.y),
    locale,
  });
});

export default guard(async function LeadersPage({ params, searchParams }: PageProps<"/[league]/[year]/leaders">) {
  const { league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys) notFound();
  const y = ys.y;
  const sp = await searchParams;
  if (!ys.canonical) permanentRedirect(withQuery(leadersPath(lg, y), sp));
  const { say } = await currentSpeaker();
  const summary = await getSummary();
  const mine = summary.seasons.filter((s) => s.league === lg);
  const years = mine.map((s) => s.year);
  const lo = Math.min(...years), hi = Math.max(...years);
  if (!years.length || y < lo || y > hi) notFound();
  const here = mine.find((s) => s.year === y);
  const label = seasonLabel(lg, y);
  const path = leadersPath(lg, y);

  const head = (
    <>
      <nav className="seasonnav" aria-label={say("season.otherSeasons")}>
        {y > lo ? <Link href={leadersPath(lg, y - 1)} rel="prev">{"← " + seasonLabel(lg, y - 1)}</Link> : null}
        {y < hi ? <Link href={leadersPath(lg, y + 1)} rel="next">{seasonLabel(lg, y + 1) + " →"}</Link> : null}
      </nav>
      <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
      <h1>{say("leaders.title", { label })}</h1>
    </>
  );

  if (!here || leagueSat(here)) {
    return (
      <>
        <AccentStyle league={lg} />
        <section className="head fade">{head}<p><NoSeason /></p></section>
      </>
    );
  }

  const hasPlayers = !!PLAYER_SPECS[lg];
  const view = hasPlayers && sp.view === "players" ? "players" : "teams";
  const [standings, brands, abbrs] = await Promise.all([getLeagueStandings(lg).catch(() => null), getBrands(), getAbbrs(lg)]);
  const idle = mine.filter(leagueSat).map((s) => s.year);
  const unfinished = new Set(mine.filter((s) => s.games > 0 && s.finals < 0.9 * s.games).map((s) => s.year));
  const clean = cleanSeasons(standings ?? [], unfinished);
  const thisYear = clean.rows.filter((r) => r.year === y);
  const finished = clean.rows.filter((r) => !clean.issues.has(r.year));

  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        {head}
        <p className="lede">{say(hasPlayers ? "leaders.lede" : "leaders.ledeTeams", { league: LG[lg] })}</p>
        <div className="lviews">
          {hasPlayers ? (
            <nav className="seg views" aria-label={say("leaders.viewAria")}>
              {(["teams", "players"] as const).map((v) => (
                <Link key={v} href={queryHref(path, sp, { view: v === "teams" ? null : v, stat: null, sort: null })} prefetch={false} scroll={false} aria-current={v === view ? "page" : undefined}>
                  {say(v === "teams" ? "leaders.teams" : "leaders.players")}
                </Link>
              ))}
            </nav>
          ) : null}
          <LeaderSeasonSelect lg={lg} seasons={[...mine].sort((a, b) => b.year - a.year).map((s) => ({ year: s.year, label: s.label }))} value={y} />
          <Link className="lback" href={seasonPath(lg, y)}>{say("leaders.toStandings", { label })}</Link>
        </div>
        {hasPlayers ? null : <p className="lunavail">{say("leaders.teamsOnly", { league: LG[lg] })}</p>}
      </section>
      {standings == null ? (
        <p className="lunavail">{say("load.failed")}</p>
      ) : view === "players" ? (
        <PlayerLeaders lg={lg} year={y} teams={thisYear} sp={sp} brands={brands} abbrs={abbrs} />
      ) : thisYear.length ? (
        <TeamLeaders lg={lg} year={y} all={finished} mine={thisYear} issue={clean.issues.get(y)} sp={sp} brands={brands} abbrs={abbrs} idle={idle} />
      ) : (
        <p className="lunavail">{say("leaders.noTeams")}</p>
      )}
    </>
  );
});
