import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { ChampionNote } from "@/components/ChampionNote";
import { ChampionSurface } from "@/components/ChampionSurface";
import { SeasonPath } from "@/components/SeasonPath";
import { SeasonPlayoffs } from "@/components/SeasonPlayoffs";
import { SeasonPostseason } from "@/components/SeasonPostseason";
import { getRounds } from "@/lib/gameRounds";
import { TeamCup } from "@/components/TeamCup";
import { getCupHistory } from "@/lib/cupHistory";
import { championFinal } from "@/lib/cupRows";
import { AllStarBanner } from "@/components/AllStar";
import { SeasonBar } from "@/components/SeasonBar";
import { LeagueSeasonNav } from "@/components/SeasonNav";
import { SeasonOutage } from "@/components/SeasonOutage";
import { SeasonGames } from "@/components/SeasonGames";
import { SeasonGamesProvider } from "@/components/SeasonGamesData";
import { SeasonWeek } from "@/components/SeasonWeek";
import { SeasonRace } from "@/components/SeasonRace";
import { SeasonStreaks } from "@/components/SeasonStreaks";
import { SeasonStandings, type SeasonStandWords } from "@/components/SeasonStandings";
import { StandingsFocus } from "@/components/StandingsFocus";
import { TeamData } from "@/components/TeamData";
import { TeamLabel } from "@/components/TeamLabel";
import { TrophyBanner } from "@/components/TrophyBanner";
import { championshipName } from "@/lib/trophies";
import { Badge, NoSeason } from "@/components/ui";
import { queryHref, ViewTabs } from "@/components/ViewTabs";
import { availableViews, dateSchema, groupStandings, viewSchema } from "@/lib/alignment";
import { getSeasonAlignment, getStandingsAsOf } from "@/lib/alignmentData";
import { chosenGroup, groupChoices, placeHeading, placeLabel, rowClasses } from "@/lib/standingsGroups";
import { joinList } from "@/lib/people-format";
import { abbrFor, abbrsForYear } from "@/lib/abbr";
import { brandFor, logoFor, teamTone } from "@/lib/brand";
import { titleHolders, titleStreak } from "@/lib/champions";
import { getAbbrs, getBrands, getSeason, getSeasonNotes, getSummary } from "@/lib/data";
import { getOutage, getOutageYears, getTitleNotAwarded } from "@/lib/outageData";
import { trophyPath } from "@/lib/awardTrophy";
import { NotAwarded } from "@/components/NotAwarded";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { BIG_FIELD, hasPlayers, hasSeries, isLeague, isMoreHockey, isSpx, leagueInfo, LG, seasonLabel, seasonSeg, srcName } from "@/lib/leagues";
import { getSeasonAffiliations } from "@/lib/affiliation";
import { parentsOfSeason } from "@/lib/affiliationView";
import { pageMeta } from "@/lib/meta";
import { isGapYear, withGaps } from "@/lib/coverage";
import { leadersPath } from "@/lib/leaderStats";
import { isIdleTeam, seasonStartDay } from "@/lib/idleTeams";
import { leagueSat } from "@/lib/noSeason";
import { scheduleNote } from "@/lib/schedule";
import { parseSelection } from "@/lib/season";
import { parseSort } from "@/lib/sort";
import { headPerGroup, seasonStandKeys, STANDINGS_FULL, type SeasonStandFlags, type SeasonStandLine } from "@/lib/seasonStandLines";
import { scoresPath } from "@/lib/scores";
import { parseSeasonSeg, seasonPath, withQuery } from "@/lib/slug";
import { getPlayerPaths } from "@/lib/playerLinks";
import { getAllStar, getClubs } from "@/lib/allStar";
import { orElse } from "@/lib/api/soften";
import { eventsOfSeason } from "@/lib/allStarView";
import { franchiseOfName, getPaths } from "@/lib/teamSlugs";
import { guard, guardMeta } from "@/lib/loadGuard";
import { clubPins } from "@/lib/venueMap";
import { getVenuePlaces } from "@/lib/venuePlace";
import { getVenueFacts, getVenueNames } from "@/lib/venueName";
import { TeamsMapCorner } from "@/components/TeamsMap";


export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/q/[league]/[year]">): Promise<Metadata> => {
  const { league, year } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  if (!isLeague(league) || !ys) return {};
  const y = ys.y;
  const { seasons } = await getSummary();
  const s = seasons.find((x) => x.league === league && x.year === y);
  if (!s && isGapYear(seasons, league, y)) {
    const { say, locale } = await currentSpeaker();
    const outage = await getOutage(league, y);
    const text = (locale === "fr" ? outage?.note_fr : locale === "ja" ? outage?.note_ja : null) ?? outage?.note_en;
    const lead = text ? text.split(/(?<=[.。])\s*/)[0] : "";
    return pageMeta({ title: say("outage.metaTitle", { label: seasonLabel(league, y), league: LG[league] }), description: lead || say("outage.metaDesc", { label: seasonLabel(league, y), league: LG[league] }), path: seasonPath(league, y), locale });
  }
  if (!s) return {};
  const { say, plural, fmt, locale } = await currentSpeaker();
  const parts = [say("season.metaLead", { label: s.label, league: LG[league] })];
  if (s.champion) parts.push(say("tip.champion", { team: s.champion }));
  if (s.games) parts.push(say("season.metaGames", { games: plural("count.regularGames", s.games), finals: fmt(s.finals) }));
  return pageMeta({ title: say("season.metaTitle", { label: s.label, league: LG[league] }), description: `${parts.join(say("sentence.sep"))}${say("sentence.end")}`, path: seasonPath(league, y), locale });
});

export default guard(async function SeasonPage({ params, searchParams }: PageProps<"/[locale]/q/[league]/[year]">) {
  const { league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys) notFound();
  const y = ys.y;
  const sp = await searchParams;
  if (!ys.canonical) permanentRedirect(withQuery(seasonPath(lg, y), sp));
  const { say, plural, fmt, dt, locale } = await currentSpeaker();
  const [d, brands, abbrs, summary, notes, paths, player, outageYears, notAwarded, allStar, clubs, rounds] = await Promise.all([getSeason(lg, y), getBrands(), getAbbrs(lg), getSummary(), getSeasonNotes(lg, y), getPaths(), getPlayerPaths(), getOutageYears(lg), getTitleNotAwarded(lg, y), orElse(getAllStar(lg), { events: [], games: [], mvps: [] }), getClubs(lg), hasSeries(lg) ? Promise.resolve(new Map<number, string>()) : getRounds(lg, y)]);
  const leagueYears = summary.seasons.filter((x) => x.league === lg).map((x) => x.year);
  const lo = Math.min(...leagueYears), hi = Math.max(...leagueYears);
  // The picker also offers the years the league sat out, so a reader can open them.
  const pickable = withGaps(summary.seasons).filter((x) => x.league === lg).sort((a, b) => b.year - a.year).map((x) => ({ year: x.year, label: x.label }));
  // The champion going into this season: the last one crowned, however many seasons the league sat out since.
  const holders = titleHolders(summary.seasons, lg, outageYears);
  const holder = holders.before(y);
  const defending = holder?.champion_franchise;
  const streak = holder && defending != null ? titleStreak(holders.byYear, defending, holder.year, holders.sat) : 0;
  if (!d) {
    if (!isGapYear(summary.seasons, lg, y)) notFound();
    return (
      <>
        <AccentStyle league={lg} />
        <section className="head fade">
          <LeagueSeasonNav lg={lg} page="season" year={y} lo={lo} hi={hi} seasons={pickable} />
          <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
          <h1>{say("season.title", { label: seasonLabel(lg, y) })}</h1>
          <p className="lede"><NoSeason /> {say("outage.lede", { league: LG[lg] })}</p>
          {holder && defending != null ? (
            <p className="lede holder">
              {streak > 1 ? say("season.defendingMany", { n: fmt(streak) }) : say("season.defending")}:{" "}
              <span className="tm"><TeamLabel lg={lg} f={defending} name={holder.champion ?? ""} logo={logoFor(brands, defending, holder.year)} /></span>
              <span className="meta"> · {say("season.wonTitle", { season: holder.label })}</span>
            </p>
          ) : null}
        </section>
        {notAwarded ? <NotAwarded row={notAwarded} /> : null}
        <SeasonOutage lg={lg} year={y} seasons={summary.seasons} />
      </>
    );
  }
  const complete = summary.seasons.some((x) => x.league === lg && x.year === y && x.champion);
  // The corner map: every club of the season at the venue it used that year, each leading to its team-season page.
  const [alignment, venuePlaces, venueNames, venueFacts, affiliations] = await Promise.all([getSeasonAlignment(lg, y).catch(() => []), getVenuePlaces(lg).catch(() => new Map()), getVenueNames().catch(() => new Map()), getVenueFacts().catch(() => new Map()), isMoreHockey(lg) ? getSeasonAffiliations(lg, y) : Promise.resolve([])]);
  // Only what the map needs travels with the page (the page is one kept copy; a team's own page has the addresses, facts and logos).
  const mapPins = clubPins({
    year: y, me: -1, clubs: d.teams.flatMap((t) => (t.f != null ? [{ franchise_id: t.f, team: t.name }] : [])), brands, abbrs, alignment, places: venuePlaces, names: venueNames, facts: venueFacts, say,
    href: (f) => paths.teamSeason(lg, f, y),
  }).map(({ f, name, abbr, lat, lon, venue, place, href, cc, conf, div }) => ({ f, name, abbr, lat, lon, venue, place, href, cc, conf, div }));
  // What the standings race needs of each club (the page is one kept copy: names, short forms and colours only).
  const raceClubs = Object.fromEntries(d.teams.map((t) => [t.id, { name: t.name ?? say("team.fallback", { id: t.f ?? t.id }), abbr: abbrFor(abbrs, t.f, y, t.name), tone: teamTone(t.f != null ? brandFor(brands, t.f, y) : null) }]));
  const note = scheduleNote({ say, plural, locale }, notes, lg, y, d.standings, complete);
  const winner = complete ? holders.byYear.get(y)?.champion_franchise : null;
  const selection = parseSelection(sp);

  const asEvents = eventsOfSeason(allStar.events, y);
  const champs = d.awards.filter((x) => x.kind === "championship");
  const champ = champs.find((x) => x.franchise_id != null) ?? champs[0];
  const champF = champ ? champ.franchise_id ?? await franchiseOfName(lg, champ.winner) : null;
  const awards = d.awards.filter((x) => x.kind !== "championship");
  // The champion of a rival hockey league met the champion of another for the Stanley Cup the spring after the season began; the NHL's own finals are in its playoffs.
  const cupFinal = (lg === "nha" || lg === "pcha" || lg === "wchl") && champF != null ? await getCupHistory().then((h) => championFinal(champF, y, h.finals, h.series, h.games)) : null;
  // The table as it stood after a day's games (?date=), when that day is before the season's last game day.
  const days = [...new Set(d.games.filter((g) => g[5] === "r" && g[6] === "f").map((g) => g[0]))].sort();
  const dateWanted = dateSchema.parse(sp.date);
  const dateAsked = dateWanted && days.length && dateWanted < days[days.length - 1] ? dateWanted : "";
  const asOfRows = dateAsked ? await getStandingsAsOf(lg, y, dateAsked) : null;
  const asOf = asOfRows?.length ? asOfRows : null;
  const asOfDate = asOf ? dateAsked : "";
  const withUnplayed = !!asOf && sp.all === "1";
  const unplayed = withUnplayed ? d.standings.filter((r) => !asOf.some((a) => a.team_id === r.team_id)).map((r) => ({ ...r, gp: 0, w: 0, l: 0, t: null, otl: null, pts: null, pf: null, pa: null, home: null, road: null, pct: null })) : [];
  const st = asOf ? [...asOf, ...unplayed].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0)) : d.standings;
  const views = availableViews(lg, y, st);
  const wantedView = viewSchema.parse(sp.view);
  const view = views.includes(wantedView) ? wantedView : "league";
  // The sub-filter buttons of the chosen view (the conferences, or the divisions): ?group= narrows the table to one of them.
  const choices = groupChoices(view, st);
  const group = chosenGroup(choices, sp.group);
  const shown = group ? st.filter(group.has) : st;
  const grouped = groupStandings(say, shown, view, leagueInfo(lg)?.name);
  const heading = placeHeading(lg, st);
  const pub = d.standings.find((r) => r.basis === "published");
  const basis = asOf ? say("season.basisAsOf") : pub ? (isSpx(pub.source) ? say("season.basisSpx") : say("season.basisSource", { source: srcName(say, pub.source) })) : say("season.basisDerived");
  const computed = d.standings.filter((r) => r.basis !== "published").flatMap((r) => (r.team ? [r.team] : []));
  const mixedNote = computed.length ? say("season.basisMixed", { teams: joinList(computed, locale) }) : "";
  const startDay = seasonStartDay(d.games.map((g) => ({ date: g[0], phase: g[5], status: g[6] })));
  const nothingPlayed = !d.games.some((g) => g[6] === "f");
  const standingsNote = [
    // (a season with published standings but no game results, the WHA's, is not an unstarted one)
    nothingPlayed && !asOf && !pub ? say("season.standingsNone") : say("season.standingsNote", { basis }),
    !asOf && pub ? mixedNote : "",
    dateWanted && !dateAsked ? say("season.dateLate") : "",
    dateAsked && !asOf ? say("season.dateMissing") : "",
    view === "wildcard" ? say("season.wildCardNote") : "",
  ].filter(Boolean).join(say("sentence.gap"));
  const regular = d.games.filter((g) => g[5] === "r");
  const maxPct = Math.max(0, ...st.map((r) => r.pct ?? 0)) || 1;
  const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);
  // (a league whose tables give no home and road records, like the AHL's, draws no empty columns)
  const showHome = st.some((r) => r.home), showRoad = st.some((r) => r.road);
  // The NHL club each club was affiliated with that season (minor leagues only), as a column of the standings.
  const parentByClub = new Map<number, { lg: string; f: number; name: string }[]>();
  for (const r of affiliations) if (!parentByClub.has(r.franchise_id)) parentByClub.set(r.franchise_id, parentsOfSeason(affiliations.filter((a) => a.franchise_id === r.franchise_id), y));

  const played = new Set(d.games.flatMap((g) => [g[1], g[4]]));
  // The table goes to the browser as short lines (lib/seasonStandLines.ts); a logo's address is long and a club's is on every row, so the lines point into one list.
  const logoList: string[] = [];
  const logoAt = (url: string | null | undefined) => (url ? (logoList.indexOf(url) >= 0 ? logoList.indexOf(url) : logoList.push(url) - 1) : -1);
  const standFlags: SeasonStandFlags = { place: heading, nhl: parentByClub.size > 0, showT, showO, showP, showHome, showRoad, maxPct, logos: logoList };
  const standLines: SeasonStandLine[] = shown.map((r, i) => {
    const line: SeasonStandLine = {
      id: r.team_id, n: r.team, gp: r.gp, w: r.w, l: r.l, t: r.t, otl: r.otl, pts: r.pts, pf: r.pf, pa: r.pa, home: r.home, road: r.road, pct: r.pct,
    };
    if (r.franchise_id != null) line.f = r.franchise_id;
    const ab = abbrFor(abbrs, r.franchise_id, y, r.team);
    if (ab) line.ab = ab;
    const lo = logoAt(logoFor(brands, r.franchise_id, y));
    if (lo >= 0) line.lo = lo;
    if (played.has(r.team_id) || isIdleTeam(r.team_id)) line.y = 1;
    if (winner != null && r.franchise_id === winner) line.wn = 1;
    if (defending != null && r.franchise_id === defending) line.df = 1;
    if (heading) line.pl = placeLabel(r);
    if (parentByClub.size) line.af = (r.franchise_id != null ? parentByClub.get(r.franchise_id) ?? [] : []).map((p) => [p.lg, p.f, p.name, logoAt(logoFor(brands, p.f))]);
    if (r.gp != null && played.has(r.team_id)) line.g = 1;
    const cl = rowClasses(r);
    if (cl) line.cl = cl;
    if (grouped.of[i] != null) line.gr = grouped.of[i];
    return line;
  });
  const standWords: SeasonStandWords = {
    label: d.label,
    winTitle: say("season.wonTitle", { season: seasonLabel(lg, y) }), winText: say("season.winner"),
    defTitle: say("season.wonTitle", { season: holder?.label ?? seasonLabel(lg, y - 1) }), defText: streak > 1 ? say("season.defendingMany", { n: fmt(streak) }) : say("season.defending"),
  };
  const sort = parseSort(sp.sort, seasonStandKeys(standFlags), "pct.desc");
  // A table of many clubs draws its first rows (of each group) until "Show all"; all the lines are in the page, and without script the link draws the table in full.
  const bigTable = shown.length > STANDINGS_FULL && sp.full !== "1";
  const standHead = headPerGroup(grouped.groups.length);
  const standAll = queryHref(seasonPath(lg, y), sp, { full: "1" });
  return (
    <SeasonGamesProvider seasonPath={seasonPath(lg, y)}>
      <AccentStyle league={lg} />
      <section className="head fade">
        <LeagueSeasonNav lg={lg} page="season" year={y} lo={lo} hi={hi} seasons={pickable} extra={<>
          {isMoreHockey(lg) ? null : <Link href={leadersPath(lg, y)} prefetch={false}>{say("leaders.link")}</Link>}
          {isMoreHockey(lg) || !hasPlayers(lg) ? null : <Link href={`${seasonPath(lg, y)}/world`} prefetch={false}>{say("country.seasonNavLink")}</Link>}
          {d.games.length ? <Link href={`${scoresPath(lg)}?season=${seasonSeg(lg, y)}`} prefetch={false}>{say("nav.scores")}</Link> : null}
        </>} />
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("season.title", { label: d.label })}</h1>
        {d.games.length === 0 && !champ && !st.length && summary.seasons.some((s) => s.league === lg && s.year === y && leagueSat(s))
          ? <p><NoSeason /></p>
          : regular.length === 0 && !complete
            ? <p className="lede">{say("season.noSchedule")}</p>
            : regular.length === 0 && pub
              ? <p className="lede">{say(d.games.length ? "season.tableAndPlayoffs" : "season.tableOnly")}</p>
              : (
              <p className="lede">
                {say("season.lede", { games: plural("count.regularGames", regular.length), finals: fmt(regular.filter((g) => g[6] === "f").length) })}
                {startDay ? ` ${say("season.starts", { date: dt.full(atUtc(startDay)) })}` : ""}
              </p>
            )}
        <SeasonBar days={days} date={asOfDate} />
        {mapPins.length ? (
          <TeamsMapCorner pins={mapPins} text={{
            title: say("map.label", { league: LG[lg], season: d.label }), open: say("map.open", { league: LG[lg], season: d.label }),
            caption: say("teams.mapCaption", { n: fmt(mapPins.length) }), note: say("season.mapNote", { n: fmt(mapPins.length), total: fmt(d.teams.length), season: d.label }),
          }} />
        ) : null}
      </section>
      {champ || asEvents.length ? (
        <div className={`bannerrow${champ ? "" : " solo"}`}>
          {champ ? (
            <TrophyBanner lg={lg} year={y}>
              <span className="cup"><Link href={trophyPath(champ.award_code)} prefetch={false}>{championshipName(lg, y, champ.award)}</Link></span>
              <Badge src={champ.source} />
              <span className="who"><TeamLabel lg={lg} f={champF} name={champ.winner} year={d.teams.some((t) => t.f === champF && played.has(t.id)) ? y : undefined} logo={logoFor(brands, champF, y)} size={40} shape="circle" /></span>
              <span className="how"><ChampionNote lg={lg} year={y} champ={champF} note={champ.note} alone /></span>
            </TrophyBanner>
          ) : null}
          {asEvents.map((ev) => <AllStarBanner key={`${ev.year}:${ev.event_no}`} lg={lg} short={LG[lg]} ev={ev} data={allStar} clubs={clubs} say={say} dt={dt} player={player} />)}
        </div>
      ) : null}
      {champ ? <ChampionSurface lg={lg} year={y} champion={champF} /> : notAwarded ? <NotAwarded row={notAwarded} /> : null}
      {d.games.length ? <SeasonWeek lg={lg} abbrs={abbrsForYear(abbrs, d.teams.map((t) => t.f), y)} year={y} complete={complete} /> : null}
      {st.length ? (
        <section className="section">
          <h2>{say("season.standings")}</h2>
          {asOf ? null : <SeasonStreaks year={y} games={d.games} standings={d.standings} champion={complete} brands={brands} href={(f) => paths.teamSeason(lg, f, y)} />}
          {asOfDate ? (
            <div className="asof">
              <b>{say("season.asOf", { date: dt.full(atUtc(asOfDate)) })}</b>
              <Link href={queryHref(seasonPath(lg, y), sp, { date: null, all: null })} prefetch={false} scroll={false}>{say("season.backFinal")}</Link>
              <Link href={queryHref(seasonPath(lg, y), sp, { all: withUnplayed ? null : "1" })} prefetch={false} scroll={false}>{say(withUnplayed ? "season.hideUnplayed" : "season.showUnplayed")}</Link>
            </div>
          ) : null}
          <StandingsFocus>
            <ViewTabs lg={lg} path={seasonPath(lg, y)} sp={sp} view={view} views={views} rows={st} choices={choices} group={group?.key ?? ""} />
            <p className="note">{standingsNote}</p>
            {(() => {
              const table = <div className="scroll"><SeasonStandings lg={lg} year={y} lines={standLines} flags={standFlags} words={standWords} groups={grouped.groups} def="pct.desc" initial={sort}
                head={bigTable ? standHead : undefined} perGroup={grouped.groups.length > 1} allHref={bigTable ? standAll : undefined} /></div>;
              return parentByClub.size ? <TeamData leagues={[lg, ...[...parentByClub.values()].flatMap((ps) => ps.map((x) => x.lg))]}>{table}</TeamData> : table;
            })()}
          </StandingsFocus>
          {asOf || BIG_FIELD.has(lg) ? null : <SeasonRace clubs={raceClubs} countsOtl={d.standings.some((r) => r.otl != null)} weekStart={lg === "nfl" ? 2 : 1} />}
        </section>
      ) : null}
      {hasSeries(lg) ? null : <SeasonPostseason lg={lg} year={y} games={d.games} teams={d.teams} rounds={rounds} brands={brands} championNote={champ?.note ?? null} />}
      <SeasonPlayoffs lg={lg} year={y} conf={typeof sp.conf === "string" ? sp.conf : ""} div={typeof sp.div === "string" ? sp.div : ""} sp={sp} />
      {cupFinal && champ ? (
        <TeamCup appearances={[cupFinal]} seasonHref={() => null} heading={say("season.cupTitle")} note={say("season.cupNote", { team: champ.winner ?? "", league: LG[lg] })} />
      ) : null}
      <SeasonPath lg={lg} year={y} seasonPath={seasonPath(lg, y)} />
      {awards.length ? (
        <section className="section">
          <h2>{say("season.awards")}</h2>
          <div className="awards">
            {awards.map((a, i) => (
              <div className="award" key={i}>
                <span className="name"><Link href={trophyPath(a.award_code)} prefetch={false}>{a.award}</Link></span>
                <span className="winner">{a.person_id != null ? <Link href={player(a.person_id, a.winner ?? "", lg)} prefetch={false}>{a.winner}</Link> : <TeamLabel lg={lg} f={a.franchise_id} name={a.winner} year={d.teams.some((t) => t.f === a.franchise_id && played.has(t.id)) ? y : undefined} logo={logoFor(brands, a.franchise_id, y)} />}</span>
                <span className="note">{a.note || ""} <Badge src={a.source} /></span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {d.games.length ? (
        <section className="section">
          <SeasonGames lg={lg} abbrs={abbrsForYear(abbrs, d.teams.map((t) => t.f), y)} year={y} initial={regular.length === 0 && sp.phase === undefined ? { ...selection, phase: "p" } : selection} groupFilter={typeof sp.conf === "string" || typeof sp.div === "string"}>
            {note ? <p className="note">{note.text}{note.src ? <>{" "}<a href={note.src} rel="noopener noreferrer">{say("sched.source")}</a></> : null}</p> : null}
          </SeasonGames>
          <noscript><p className="note"><Link href={`${scoresPath(lg)}?season=${seasonSeg(lg, y)}`}>{say("nav.scores")}</Link></p></noscript>
        </section>
      ) : null}
    </SeasonGamesProvider>
  );
});
