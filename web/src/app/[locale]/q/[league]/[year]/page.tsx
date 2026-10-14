import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { ChampionNote } from "@/components/ChampionNote";
import { ChampionSurface } from "@/components/ChampionSurface";
import { SeasonPath } from "@/components/SeasonPath";
import { SeasonPlayoffs } from "@/components/SeasonPlayoffs";
import { SeasonBar } from "@/components/SeasonBar";
import { LeagueSeasonNav } from "@/components/SeasonNav";
import { SeasonOutage } from "@/components/SeasonOutage";
import { SeasonGames } from "@/components/SeasonGames";
import { SeasonStreaks } from "@/components/SeasonStreaks";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { TrophyBanner } from "@/components/TrophyBanner";
import { Badge, NoSeason } from "@/components/ui";
import { queryHref, ViewTabs } from "@/components/ViewTabs";
import { availableViews, dateSchema, groupStandings, viewSchema } from "@/lib/alignment";
import { getStandingsAsOf } from "@/lib/alignmentData";
import type { StandingRow } from "@/lib/api/types";
import { abbrFor } from "@/lib/abbr";
import { logoFor } from "@/lib/brand";
import { titleHolders, titleStreak } from "@/lib/champions";
import { getAbbrs, getBrands, getSeason, getSeasonNotes, getSummary } from "@/lib/data";
import { getOutage, getOutageYears, getTitleNotAwarded } from "@/lib/outageData";
import { NotAwarded } from "@/components/NotAwarded";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, isSpx, LEAGUES, LG, seasonLabel, srcName } from "@/lib/leagues";
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
import { franchiseOfName, getPaths } from "@/lib/teamSlugs";
import { guard, guardMeta } from "@/lib/loadGuard";


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
  const [d, brands, abbrs, summary, notes, paths, player, outageYears, notAwarded] = await Promise.all([getSeason(lg, y), getBrands(), getAbbrs(lg), getSummary(), getSeasonNotes(lg, y), getPaths(), getPlayerPaths(), getOutageYears(lg), getTitleNotAwarded(lg, y)]);
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
  const note = scheduleNote({ say, plural, locale }, notes, lg, y, d.standings, complete);
  const winner = complete ? holders.byYear.get(y)?.champion_franchise : null;
  const selection = parseSelection(sp);

  const champs = d.awards.filter((x) => x.kind === "championship");
  const champ = champs.find((x) => x.franchise_id != null) ?? champs[0];
  const champF = champ ? champ.franchise_id ?? await franchiseOfName(lg, champ.winner) : null;
  const awards = d.awards.filter((x) => x.kind !== "championship");
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
  const grouped = groupStandings(say, st, view, LEAGUES.find((l) => l.code === lg)?.name);
  const pub = d.standings.find((r) => r.basis === "published");
  const basis = asOf ? say("season.basisAsOf") : pub ? (isSpx(pub.source) ? say("season.basisSpx") : say("season.basisSource", { source: srcName(say, pub.source) })) : say("season.basisDerived");
  const startDay = seasonStartDay(d.games.map((g) => ({ date: g[0], phase: g[5], status: g[6] })));
  const nothingPlayed = !d.games.some((g) => g[6] === "f");
  const standingsNote = [
    nothingPlayed && !asOf ? say("season.standingsNone") : say("season.standingsNote", { basis }),
    dateWanted && !dateAsked ? say("season.dateLate") : "",
    dateAsked && !asOf ? say("season.dateMissing") : "",
    view === "wildcard" ? say("season.wildCardNote") : "",
  ].filter(Boolean).join(say("sentence.gap"));
  const regular = d.games.filter((g) => g[5] === "r");
  const maxPct = Math.max(0, ...st.map((r) => r.pct ?? 0)) || 1;
  const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);

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
    { key: "home", label: say("col.home"), get: (r) => recShare(r.home), cell: (r) => r.home || "" },
    { key: "road", label: say("col.road"), get: (r) => recShare(r.road), cell: (r) => r.road || "" },
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
  const standings = tableOf(st, cols, (r) => r.team_id);
  standings.rows.forEach((r, i) => { r.group = grouped.of[i]; });
  const sort = parseSort(sp.sort, cols.map((c) => c.key), "pct.desc");
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <LeagueSeasonNav lg={lg} page="season" year={y} lo={lo} hi={hi} seasons={pickable} extra={<>
          <Link href={leadersPath(lg, y)} prefetch={false}>{say("leaders.link")}</Link>
          <Link href={`${seasonPath(lg, y)}/world`} prefetch={false}>{say("country.seasonNavLink")}</Link>
          {d.games.length ? <Link href={`${scoresPath(lg)}?season=${seasonLabel(lg, y)}`} prefetch={false}>{say("nav.scores")}</Link> : null}
        </>} />
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("season.title", { label: d.label })}</h1>
        {d.games.length === 0 && !champ && !st.length && summary.seasons.some((s) => s.league === lg && s.year === y && leagueSat(s))
          ? <p><NoSeason /></p>
          : regular.length === 0 && !complete
            ? <p className="lede">{say("season.noSchedule")}</p>
            : (
              <p className="lede">
                {say("season.lede", { games: plural("count.regularGames", regular.length), finals: fmt(regular.filter((g) => g[6] === "f").length) })}
                {startDay ? ` ${say("season.starts", { date: dt.full(atUtc(startDay)) })}` : ""}
              </p>
            )}
        <SeasonBar days={days} date={asOfDate} />
      </section>
      {champ ? (
        <>
          <TrophyBanner lg={lg}>
            <span className="cup">{champ.award}</span>
            <Badge src={champ.source} />
            <span className="who"><TeamLabel lg={lg} f={champF} name={champ.winner} year={d.teams.some((t) => t.f === champF && played.has(t.id)) ? y : undefined} logo={logoFor(brands, champF, y)} size={40} shape="circle" /></span>
            <span className="how"><ChampionNote lg={lg} year={y} champ={champF} note={champ.note} alone /></span>
          </TrophyBanner>
          <ChampionSurface lg={lg} year={y} champion={champF} />
        </>
      ) : notAwarded ? <NotAwarded row={notAwarded} /> : null}
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
          <ViewTabs lg={lg} path={seasonPath(lg, y)} sp={sp} view={view} views={views} rows={st} />
          <p className="note">{standingsNote}</p>
          <div className="scroll"><SortTable {...standings} def="pct.desc" initial={sort} groups={grouped.groups} /></div>
        </section>
      ) : null}
      <SeasonPlayoffs lg={lg} year={y} conf={typeof sp.conf === "string" ? sp.conf : ""} div={typeof sp.div === "string" ? sp.div : ""} sp={sp} />
      <SeasonPath lg={lg} year={y} />
      {awards.length ? (
        <section className="section">
          <h2>{say("season.awards")}</h2>
          <div className="awards">
            {awards.map((a, i) => (
              <div className="award" key={i}>
                <span className="name">{a.award}</span>
                <span className="winner">{a.person_id != null ? <Link href={player(a.person_id, a.winner ?? "", lg)} prefetch={false}>{a.winner}</Link> : <TeamLabel lg={lg} f={a.franchise_id} name={a.winner} year={d.teams.some((t) => t.f === a.franchise_id && played.has(t.id)) ? y : undefined} logo={logoFor(brands, a.franchise_id, y)} />}</span>
                <span className="note">{a.note || ""} <Badge src={a.source} /></span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {d.games.length ? (
        <section className="section">
          <SeasonGames lg={lg} abbrs={abbrs} year={y} games={d.games} teams={d.teams.map((x) => ({ ...x, logo: logoFor(brands, x.f, y) }))} initial={selection}>
            {note ? <p className="note">{note.text}{note.src ? <>{" "}<a href={note.src} rel="noopener noreferrer">{say("sched.source")}</a></> : null}</p> : null}
          </SeasonGames>

        </section>
      ) : null}
    </>
  );
});
