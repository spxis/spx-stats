import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { ChampionNote } from "@/components/ChampionNote";
import { ChampionSurface } from "@/components/ChampionSurface";
import { SeasonPath } from "@/components/SeasonPath";
import { SeasonPlayoffs } from "@/components/SeasonPlayoffs";
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
import { SortTable } from "@/components/SortTable";
import { StandingsFocus } from "@/components/StandingsFocus";
import { TeamLabel } from "@/components/TeamLabel";
import { TrophyBanner } from "@/components/TrophyBanner";
import { championshipName } from "@/lib/trophies";
import { Badge, NoSeason } from "@/components/ui";
import { queryHref, ViewTabs } from "@/components/ViewTabs";
import { availableViews, dateSchema, groupStandings, viewSchema } from "@/lib/alignment";
import { getSeasonAlignment, getStandingsAsOf } from "@/lib/alignmentData";
import { chosenGroup, groupChoices, placeHeading, placeLabel, rowClasses } from "@/lib/standingsGroups";
import type { StandingRow } from "@/lib/api/types";
import { joinList } from "@/lib/people-format";
import { abbrFor, abbrsForYear } from "@/lib/abbr";
import { brandFor, logoFor, teamTone } from "@/lib/brand";
import { titleHolders, titleStreak } from "@/lib/champions";
import { getAbbrs, getBrands, getSeason, getSeasonNotes, getSummary } from "@/lib/data";
import { getOutage, getOutageYears, getTitleNotAwarded } from "@/lib/outageData";
import { trophyPath } from "@/lib/awardTrophy";
import { NotAwarded } from "@/components/NotAwarded";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, isMoreHockey, isSpx, leagueInfo, LG, seasonLabel, seasonSeg, srcName } from "@/lib/leagues";
import { getSeasonAffiliations } from "@/lib/affiliation";
import { parentsOfSeason } from "@/lib/affiliationView";
import { pageMeta } from "@/lib/meta";
import { isGapYear, withGaps } from "@/lib/coverage";
import { leadersPath } from "@/lib/leaderStats";
import { isIdleTeam, seasonStartDay } from "@/lib/idleTeams";
import { leagueSat } from "@/lib/noSeason";
import { scheduleNote } from "@/lib/schedule";
import { parseSelection } from "@/lib/season";
import { parseSort, recShare, tableOf, type ColumnSpec } from "@/lib/sort";
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
  const [d, brands, abbrs, summary, notes, paths, player, outageYears, notAwarded, allStar, clubs] = await Promise.all([getSeason(lg, y), getBrands(), getAbbrs(lg), getSummary(), getSeasonNotes(lg, y), getPaths(), getPlayerPaths(), getOutageYears(lg), getTitleNotAwarded(lg, y), orElse(getAllStar(lg), { events: [], games: [], mvps: [] }), getClubs(lg)]);
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
  const parentName = (r: StandingRow) => (r.franchise_id != null ? parentByClub.get(r.franchise_id)?.[0]?.name ?? "" : "");

  const played = new Set(d.games.flatMap((g) => [g[1], g[4]]));
  const cols: ColumnSpec<StandingRow>[] = [
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => (
        <>
          <TeamLabel lg={lg} f={r.franchise_id} name={r.team} year={played.has(r.team_id) || isIdleTeam(r.team_id) ? y : undefined} abbr={abbrFor(abbrs, r.franchise_id, y, r.team)} logo={logoFor(brands, r.franchise_id, y)} />
          {winner != null && r.franchise_id === winner ? (
            <span className="defending winner" title={say("season.wonTitle", { season: seasonLabel(lg, y) })}>{say("season.winner")}</span>
          ) : null}
          {defending != null && r.franchise_id === defending ? (
            <span className="defending" title={say("season.wonTitle", { season: holder?.label ?? seasonLabel(lg, y - 1) })}>{streak > 1 ? say("season.defendingMany", { n: fmt(streak) }) : say("season.defending")}</span>
          ) : null}
        </>
      ),
    },
    ...(heading ? [{ key: "place", label: say(heading), cls: "place", get: (r: StandingRow) => placeLabel(r) }] : []),
    ...(parentByClub.size ? [{
      key: "nhl", label: say("affil.col"), cls: "team", get: (r: StandingRow) => parentName(r),
      cell: (r: StandingRow) => (r.franchise_id != null ? parentByClub.get(r.franchise_id) ?? [] : []).map((p) => (
        <span key={p.f} className="affilcell"><TeamLabel lg={p.lg} f={p.f} name={p.name} logo={logoFor(brands, p.f)} /></span>
      )),
    }] : []),
    {
      key: "gp", label: say("col.gp"), num: true, title: say("col.gpTeamTitle"), get: (r) => r.gp,
      cell: (r) => (r.gp != null && played.has(r.team_id) ? (
        <Link href={paths.teamSeason(lg, r.franchise_id, y)} prefetch={false} title={say("season.teamGames", { team: r.team ?? "", label: d.label })}>{r.gp}</Link>
      ) : r.gp ?? ""),
    },
    { key: "w", label: say("col.w"), num: true, get: (r) => r.w }, { key: "l", label: say("col.l"), num: true, get: (r) => r.l },
    ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (r: StandingRow) => r.t }] : []),
    ...(showO ? [{ key: "otl", label: say("col.otl"), num: true, get: (r: StandingRow) => r.otl }] : []),
    ...(showP ? [{ key: "pts", label: say("col.pts"), num: true, get: (r: StandingRow) => r.pts }] : []),
    { key: "pf", label: say("col.for"), num: true, get: (r) => r.pf, cell: (r) => (r.pf != null ? fmt(r.pf) : "") },
    { key: "pa", label: say("col.against"), num: true, get: (r) => r.pa, cell: (r) => (r.pa != null ? fmt(r.pa) : "") },
    ...(showHome ? [{ key: "home", label: say("col.home"), get: (r: StandingRow) => recShare(r.home), cell: (r: StandingRow) => r.home || "" }] : []),
    ...(showRoad ? [{ key: "road", label: say("col.road"), get: (r: StandingRow) => recShare(r.road), cell: (r: StandingRow) => r.road || "" }] : []),
    {
      key: "pct", label: say("col.pct"), num: true, get: (r) => r.pct,
      cell: (r) => (
        <>
          {r.pct != null ? fmt3(r.pct) : ""}
          {r.pct != null ? <span className="pctbar" style={{ width: `${Math.round((60 * r.pct) / maxPct)}px` }} /> : null}
        </>
      ),
    },
  ];
  const standings = tableOf(shown, cols, (r) => r.team_id, (r) => rowClasses(r) || undefined);
  standings.rows.forEach((r, i) => { r.group = grouped.of[i]; });
  const sort = parseSort(sp.sort, cols.map((c) => c.key), "pct.desc");
  return (
    <SeasonGamesProvider seasonPath={seasonPath(lg, y)}>
      <AccentStyle league={lg} />
      <section className="head fade">
        <LeagueSeasonNav lg={lg} page="season" year={y} lo={lo} hi={hi} seasons={pickable} extra={<>
          {isMoreHockey(lg) ? null : <Link href={leadersPath(lg, y)} prefetch={false}>{say("leaders.link")}</Link>}
          {isMoreHockey(lg) ? null : <Link href={`${seasonPath(lg, y)}/world`} prefetch={false}>{say("country.seasonNavLink")}</Link>}
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
            <div className="scroll"><SortTable {...standings} def="pct.desc" initial={sort} groups={grouped.groups} /></div>
          </StandingsFocus>
          {asOf ? null : <SeasonRace clubs={raceClubs} countsOtl={d.standings.some((r) => r.otl != null)} weekStart={lg === "nfl" ? 2 : 1} />}
        </section>
      ) : null}
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
