import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache, Suspense } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { CompareControl } from "@/components/CompareControl";
import { TeamFlag } from "@/components/TeamFlag";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamRoster } from "@/components/TeamRoster";
import { TeamStaff } from "@/components/TeamStaff";
import { SeasonMapDialog, SeasonMapThumb, SeasonVenueLine } from "@/components/SeasonMap";
import { TeamPlayoffSeries } from "@/components/TeamPlayoffSeries";
import { TeamRanks } from "@/components/TeamRanks";
import { TeamSeasonView } from "@/components/TeamSeasonView";
import { BadgeCup } from "@/components/TrophyIcon";
import { Figures, NoSeason } from "@/components/ui";
import { getSeasonAlignment } from "@/lib/alignmentData";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { titleHolders } from "@/lib/champions";
import { getAbbrs, getBrands, getSeason, getSeasonNotes, getSeasonStandings, getTeam, getTeamGames, getTeamStandings, getSummary } from "@/lib/data";
import { atUtc, fmt3 } from "@/lib/format";
import { seasonStartDay } from "@/lib/idleTeams";
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
import { playedFromRows, regularSeasonOpen, resultsByTeam, teamStreaks, type Run } from "@/lib/streaks";
import { placeFor } from "@/lib/venue";
import { deriveTeamGames, seasonRecord, teamsIn, TEAM_GAME_SORT_KEYS } from "@/lib/teamSeason";
import { parseSeasonSeg, seasonPath, withQuery } from "@/lib/slug";
import { getFigureRanks } from "@/lib/teamFigures";
import { teamRanks } from "@/lib/teamRanks";
import { getPaths, teamSeasonOf } from "@/lib/teamSlugs";
import { clubPins } from "@/lib/venueMap";
import { SeasonNav } from "@/components/SeasonNav";
import { getVenuePlaces } from "@/lib/venuePlace";
import { getVenueFacts, getVenueNames } from "@/lib/venueName";
import { guard, guardMeta } from "@/lib/loadGuard";

/** The team's season: its games (in date order, or the reverse), its standings row for the year and its brand for the year. */
const load = cache(async (lg: string, y: number, f: number, dir: "asc" | "desc") => {
  const [raw, stAll, brands, abbrs] = await Promise.all([getTeamGames(lg, y, f, dir), getTeamStandings(lg, f), getBrands(), getAbbrs(lg)]);
  const st = stAll.find((r) => r.year === y) ?? null;
  const first = raw.find((g) => g.home_f === f) ?? raw[0];
  const mine = first ? (first.home_f === f ? { id: first.home_id, name: first.home } : { id: first.away_id, name: first.away }) : null;
  return { abbrs, brands, raw, st, brand: brandFor(brands, f, y), logo: logoFor(brands, f, y), place: placeFor(brands, f, y), me: mine, name: st?.team || mine?.name || `Team ${f}` };
});

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/q/[league]/[year]/team/[franchise]">): Promise<Metadata> => {
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

export default guard(async function TeamSeasonPage({ params, searchParams }: PageProps<"/[locale]/q/[league]/[year]/team/[franchise]">) {
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
  const { say, plural, fmt, dt, locale } = await currentSpeaker();
  const sort = parseSort(sp.sort, TEAM_GAME_SORT_KEYS, "date.asc");
  const dateSort = sort.find((s) => s.key === "date");
  const [d, t, summary, leagueSt, notes, alignment, venuePlaces] = await Promise.all([load(lg, y, f, dateSort?.dir ?? "asc"), getTeam(lg, f), getSummary(), getSeasonStandings(lg, y), getSeasonNotes(lg, y), getSeasonAlignment(lg, y), getVenuePlaces(lg)]);
  const [venueNames, venueFacts] = await Promise.all([getVenueNames(), getVenueFacts()]);
  const hereSeason = summary.seasons.find((x) => x.league === lg && x.year === y);
  if (!d.raw.length && hereSeason && !hereSeason.champion && !leagueSat(hereSeason)) {
    // a season that is under way or still to start, and this club has no game yet
    const all = await getSeason(lg, y);
    const startDay = seasonStartDay((all?.games ?? []).map((g) => ({ date: g[0], phase: g[5], status: g[6] })));
    const { dt } = await currentSpeaker();
    const label = seasonLabel(lg, y);
    return (
      <>
        <AccentStyle league={lg} team={d.brand?.primary_hex ? teamAccent(d.brand) : undefined} />
        <section className="head fade">
          <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
          <div className="namerow">
            <h1 className="teamname"><TeamLogo url={d.logo} size={56} />{all?.standings.find((r) => r.franchise_id === f)?.team || d.name}</h1>
            <div className="seasonside">
              <Link className="seasonlabel" href={seasonPath(lg, y)}>{say("season.title", { label })}</Link>
            </div>
          </div>
          <p className="lede">
            {say("tseason.noGames")}{" "}
            {startDay ? say("season.starts", { date: dt.full(atUtc(startDay)) }) : say("season.noSchedule")}{" "}
            <Link href={paths.team(lg, f)}>{say("tseason.allSeasons")}</Link>
          </p>
        </section>
      </>
    );
  }
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
  // Streaks of the regular season: the one running now while the season is on, and the longest winning and losing ones.
  const countsOtl = leagueSt.some((r) => r.otl != null);
  const streaks = teamStreaks(resultsByTeam(playedFromRows(raw), countsOtl).get(f) ?? []);
  const streakOn = regularSeasonOpen(raw.map((g) => ({ regular: g.phase === "regular", scheduled: g.status === "scheduled" })), complete);
  const streakBreaks = countsOtl || raw.some((g) => g.phase === "regular" && g.status === "final" && g.home_score != null && g.home_score === g.away_score);
  const outcomeKey = { W: "col.w", L: "col.l", T: "col.t", OTL: "col.otl" } as const;
  const span = (r: Run) => (r.from === r.to ? dt.monthDayShort(atUtc(r.from)) : `${dt.monthDayShort(atUtc(r.from))} – ${dt.monthDayShort(atUtc(r.to))}`);
  const longest = (r: Run | null, key: "streaks.longestWin" | "streaks.longestLoss"): [string, number | string][] =>
    r && r.length >= 2 ? [[say("streaks.withDates", { label: say(key), dates: span(r) }), r.length]] : [];
  const streakFigs: [string, number | string][] = [
    ...(streakOn && streaks.current ? [[say("streaks.current"), `${say(outcomeKey[streaks.current.kind])}${fmt(streaks.current.length)}`] as [string, string]] : []),
    ...longest(streaks.win, "streaks.longestWin"),
    ...longest(streaks.loss, "streaks.longestLoss"),
  ];
  figs.push(...streakFigs);
  const note = scheduleNote({ say, plural, locale }, notes, lg, y, leagueSt, complete, { name, played: st?.gp ?? null, franchise: f });
  const here = summary.seasons.find((x) => x.league === lg && x.year === y);
  const ranks = teamRanks(leagueSt, f, !!here && here.games > 0 && here.finals < 0.9 * here.games, LG[lg]);
  const figureRanks = await getFigureRanks(lg, y, f);
  const selection = parseSelection(sp);
  const mapPins = clubPins({
    year: y, me: f, clubs: [...leagueSt, { franchise_id: f, team: name }], brands, abbrs, alignment, places: venuePlaces, names: venueNames, facts: venueFacts, say,
    href: (c) => paths.teamSeason(lg, c, y), slug: (c) => paths.season(lg, c, y),
  });
  const mePin = mapPins.find((p) => p.f === f);
  const seasonNav = prev != null || next != null || current != null ? (
    <SeasonNav aria={say("tseason.otherSeasons")} prefetch={false}
      prev={prev != null ? { href: paths.teamSeason(lg, f, prev), label: seasonLabel(lg, prev) } : null}
      next={next != null ? { href: paths.teamSeason(lg, f, next), label: seasonLabel(lg, next) } : null}
      extra={current != null ? <Link href={paths.teamSeason(lg, f, current)} prefetch={false}>{say("tseason.current")}</Link> : null} />
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
          <div className="seasonside">
            <Link className="seasonlabel" href={seasonPath(lg, y)}>{say("season.title", { label: season })}</Link>
            {ranks || figureRanks.length ? <TeamRanks lg={lg} year={y} ranks={ranks} figures={figureRanks} /> : null}
          </div>
        </div>
        {isChamp ? <span className="reigning"><BadgeCup league={lg} />{say("tseason.champions", { season })}</span> : null}
        <p className="lede">
          {say("tseason.lede", { season, record: text }) + " "}
          <Link href={paths.team(lg, f)}>{say("tseason.allSeasons")}</Link>{" · "}
          <Link href={`${seasonPath(lg, y)}?team=${me?.id}`}>{say("tseason.wholeSeason", { league: LG[lg] })}</Link>        </p>
        {place?.home_venue ? (mePin ? <SeasonVenueLine venue={mePin.venue ?? place.home_venue} /> : <p className="lede">{say("tseason.venue", { venue: place.home_venue })}</p>) : null}
        {mePin ? <SeasonMapThumb me={mePin} leagueShort={LG[lg]} seasonLabel={season} name={name} /> : null}
        <CompareControl lg={lg} f={f} name={name} year={y} />
      </section>
      {mePin ? <SeasonMapDialog pins={mapPins} me={f} clubCount={new Set(leagueSt.map((r) => r.franchise_id)).size || mapPins.length} leagueShort={LG[lg]} seasonLabel={season} /> : null}
      <Figures items={figs} />
      {streakFigs.length ? <p className="note">{say(streakBreaks ? "streaks.noteBreak" : "streaks.note")}</p> : null}
      {note ? <p className="note">{note.text}{note.src ? <>{" "}<a href={note.src} rel="noopener noreferrer">{say("sched.source")}</a></> : null}</p> : null}
      <TeamPlayoffSeries lg={lg} year={y} f={f} />
      {st ? <Suspense fallback={null}><TeamStaff lg={lg} teamSeasonId={st.team_id} /></Suspense> : null}
      {st ? <Suspense fallback={null}><TeamRoster lg={lg} season={season} teamSeasonId={st.team_id} path={at.path} sp={sp} /></Suspense> : null}
      <TeamSeasonView lg={lg} abbrs={abbrs} season={season} year={y} initialLoc={parseLoc(sp.loc)} initialResult={parseResult(sp.result)}meId={me?.id ?? 0} games={games} teams={teamsIn(raw).map((x) => ({ ...x, logo: logoFor(brands, x.f, y) }))} record={rec}
        initial={{ ...selection, team: "" }} initialSort={sort} seasonNav={seasonNav} today={new Date().toISOString().slice(0, 10)} />
    </>
  );
});
