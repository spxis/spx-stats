import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { TeamFlag } from "@/components/TeamFlag";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamPlayoffSeries } from "@/components/TeamPlayoffSeries";
import { TeamSeasonView } from "@/components/TeamSeasonView";
import { BadgeCup } from "@/components/TrophyIcon";
import { Figures, NoSeason } from "@/components/ui";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { titleHolders } from "@/lib/champions";
import { getAbbrs, getBrands, getSeasonNotes, getSeasonStandings, getTeam, getTeamGames, getTeamStandings, getSummary } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { parseLoc } from "@/lib/loc";
import { pageMeta } from "@/lib/meta";
import { leagueSat } from "@/lib/noSeason";
import { recordText } from "@/lib/record";
import { parseResult } from "@/lib/resultFilter";
import { scheduleNote } from "@/lib/schedule";
import { parseSelection } from "@/lib/season";
import { parseSort } from "@/lib/sort";
import { placeFor } from "@/lib/venue";
import { deriveTeamGames, seasonRecord, teamsIn, TEAM_GAME_SORT_KEYS } from "@/lib/teamSeason";
import { parseSeasonSeg, seasonPath, withQuery } from "@/lib/slug";
import { getPaths, teamSeasonOf } from "@/lib/teamSlugs";
import { guard, guardMeta } from "@/lib/loadGuard";

/** The team's season: its games (in date order, or the reverse), its standings row for the year and its brand for the year. */
const load = cache(async (lg: string, y: number, f: number, dir: "asc" | "desc") => {
  const [raw, stAll, brands, abbrs] = await Promise.all([getTeamGames(lg, y, f, dir), getTeamStandings(lg, f), getBrands(), getAbbrs(lg)]);
  const st = stAll.find((r) => r.year === y) ?? null;
  const first = raw.find((g) => g.home_f === f) ?? raw[0];
  const mine = first ? (first.home_f === f ? { id: first.home_id, name: first.home } : { id: first.away_id, name: first.away }) : null;
  return { abbrs, brands, raw, st, brand: brandFor(brands, f, y), logo: logoFor(brands, f, y), place: placeFor(brands, f, y), me: mine, name: st?.team || mine?.name || `Team ${f}` };
});

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[league]/[year]/team/[franchise]">): Promise<Metadata> => {
  const { league, year, franchise } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  if (!isLeague(league) || !ys) return {};
  const y = ys.y;
  const at = await teamSeasonOf(league, y, franchise);
  if (!at) return {};
  const f = at.f;
  const d = await load(league, y, f, "asc");
  if (!d.raw.length) return { robots: { index: false } };
  const { say, locale } = await currentSpeaker();
  const season = seasonLabel(league, y);
  const rec = seasonRecord(deriveTeamGames(d.raw, f, d.st), d.st);
  return pageMeta({
    title: `${d.name} ${season} · ${LG[league]}`,
    description: say("tseason.metaDesc", { name: d.name, season, league: LG[league], games: d.raw.length, record: recordText(rec) }),
    path: at.path,
    locale,
  });
});

export default guard(async function TeamSeasonPage({ params, searchParams }: PageProps<"/[league]/[year]/team/[franchise]">) {
  const { league: lg, year, franchise } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys) notFound();
  const y = ys.y;
  const at = await teamSeasonOf(lg, y, franchise);
  if (!at) notFound();
  const sp = await searchParams;
  if (at.path !== `/${lg}/${year}/team/${franchise}`) permanentRedirect(withQuery(at.path, sp));
  const f = at.f;
  const paths = await getPaths();
  const { say, plural, fmt, locale } = await currentSpeaker();
  const sort = parseSort(sp.sort, TEAM_GAME_SORT_KEYS, "date.asc");
  const dateSort = sort.find((s) => s.key === "date");
  const [d, t, summary, leagueSt, notes] = await Promise.all([load(lg, y, f, dateSort?.dir ?? "asc"), getTeam(lg, f), getSummary(), getSeasonStandings(lg, y), getSeasonNotes(lg, y)]);
  if (!d.raw.length) {
    return (
      <>
        <AccentStyle league={lg} />
        <p><NoSeason kind={summary.seasons.some((x) => x.league === lg && x.year === y && leagueSat(x)) ? "league" : "team"} /></p>
        <p><Link href={seasonPath(lg, y)}>{say("tseason.back")}</Link></p>
      </>
    );
  }
  const { abbrs, brands, raw, st, brand: b, logo, place, me, name } = d;
  const games = deriveTeamGames(raw, f, st);
  const rec = seasonRecord(games, st);
  const season = seasonLabel(lg, y);
  const years = (t?.seasons ?? []).map((s) => s[0]).sort((a, c) => a - c);
  const prev = years.filter((v) => v < y).at(-1), next = years.find((v) => v > y);
  const latest = Math.max(...summary.seasons.filter((x) => x.league === lg && x.games > 0).map((x) => x.year));
  const current = years.at(-1) === latest && y !== latest ? latest : null;
  const isChamp = titleHolders(summary.seasons, lg).byYear.get(y)?.champion_franchise === f;
  const text = recordText(rec);
  const decisions = rec.w + rec.l + rec.t + rec.otl;

  const figs: [string, number | string][] = [[say("fig.record"), text]];
  if (st?.pts != null) figs.push([say("fig.points"), st.pts]);
  figs.push([say("fig.share"), decisions ? fmt3((rec.w + rec.t / 2) / decisions) : "—"]);
  if (st?.pf != null && st.pa != null) figs.push([say("fig.pointsFor"), fmt(st.pf)], [say("fig.pointsAgainst"), fmt(st.pa)]);
  if (st?.home) figs.push([say("col.home"), st.home]);
  if (st?.road) figs.push([say("col.road"), st.road]);

  const complete = summary.seasons.some((x) => x.league === lg && x.year === y && x.champion);
  const note = scheduleNote({ say, plural, locale }, notes, lg, y, leagueSt, complete, { name, played: st?.gp ?? null, franchise: f });
  const selection = parseSelection(sp);
  const seasonNav = prev != null || next != null ? (
    <nav className="seasonnav" aria-label={say("tseason.otherSeasons")}>
      {prev != null ? <Link href={paths.teamSeason(lg, f, prev)} rel="prev" prefetch={false}>{"← " + seasonLabel(lg, prev)}</Link> : null}
      {next != null ? <Link href={paths.teamSeason(lg, f, next)} rel="next" prefetch={false}>{seasonLabel(lg, next) + " →"}</Link> : null}
    </nav>
  ) : null;
  return (
    <>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      {b?.primary_hex ? (
        <div className="teamband" style={{ "--tp": `#${b.primary_hex}`, "--ts": `#${b.secondary_hex || b.primary_hex}` } as React.CSSProperties} />
      ) : null}
      <section className="head fade">
        {seasonNav}
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <div className="namerow">
          <h1 className="teamname"><TeamLogo url={logo} size={56} />{name}<TeamFlag code={countryAt(place?.latitude, place?.longitude)} /></h1>
          <Link className="seasonlabel" href={seasonPath(lg, y)}>{say("season.title", { label: season })}</Link>
        </div>
        {isChamp ? <span className="reigning"><BadgeCup league={lg} />{say("tseason.champions", { season })}</span> : null}
        <p className="lede">
          {say("tseason.lede", { season, record: text }) + " "}
          <Link href={paths.team(lg, f)}>{say("tseason.allSeasons")}</Link>{" · "}
          <Link href={`${seasonPath(lg, y)}?team=${me?.id}`}>{say("tseason.wholeSeason", { league: LG[lg] })}</Link>
          {current != null ? <>{" · "}<Link href={paths.teamSeason(lg, f, current)} prefetch={false}>{say("tseason.current")}</Link></> : null}
        </p>
        {place?.home_venue ? <p className="lede">{say("tseason.venue", { venue: place.home_venue })}</p> : null}
      </section>
      <Figures items={figs} />
      {note ? <p className="note">{note.text}{note.src ? <>{" "}<a href={note.src} rel="noopener noreferrer">{say("sched.source")}</a></> : null}</p> : null}
      <TeamPlayoffSeries lg={lg} year={y} f={f} />
      <TeamSeasonView lg={lg} abbrs={abbrs} season={season} year={y} initialLoc={parseLoc(sp.loc)} initialResult={parseResult(sp.result)}meId={me?.id ?? 0} games={games} teams={teamsIn(raw).map((x) => ({ ...x, logo: logoFor(brands, x.f, y) }))} record={rec}
        initial={{ ...selection, team: "" }} initialSort={sort} seasonNav={seasonNav} />
    </>
  );
});
