import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { ChampionNote } from "@/components/ChampionNote";
import { SeasonPlayoffs } from "@/components/SeasonPlayoffs";
import { SeasonBar } from "@/components/SeasonBar";
import { SeasonGames } from "@/components/SeasonGames";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { Badge, NoSeason, TeamLink } from "@/components/ui";
import { queryHref, ViewTabs } from "@/components/ViewTabs";
import { availableViews, dateSchema, groupStandings, viewSchema } from "@/lib/alignment";
import { getStandingsAsOf } from "@/lib/alignmentData";
import type { StandingRow } from "@/lib/api/types";
import { abbrFor } from "@/lib/abbr";
import { logoFor } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getAbbrs, getBrands, getSeason, getSeasonNotes, getSummary } from "@/lib/data";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, isSpx, LG, seasonLabel, srcName } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { isGapYear } from "@/lib/coverage";
import { leadersPath } from "@/lib/leaderStats";
import { leagueSat } from "@/lib/noSeason";
import { scheduleNote } from "@/lib/schedule";
import { parseSelection } from "@/lib/season";
import { parseSort, recShare, tableOf, type ColumnSpec } from "@/lib/sort";
import { parseSeasonSeg, seasonPath, withQuery } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";


export async function generateMetadata({ params }: PageProps<"/[league]/[year]">): Promise<Metadata> {
  const { league, year } = await params;
  const ys = isLeague(league) ? parseSeasonSeg(league, year) : null;
  if (!isLeague(league) || !ys) return {};
  const y = ys.y;
  const { seasons } = await getSummary();
  const s = seasons.find((x) => x.league === league && x.year === y);
  if (!s) return {};
  const { say, plural, fmt, locale } = await currentSpeaker();
  const parts = [say("season.metaLead", { label: s.label, league: LG[league] })];
  if (s.champion) parts.push(say("tip.champion", { team: s.champion }));
  if (s.games) parts.push(say("season.metaGames", { games: plural("count.regularGames", s.games), finals: fmt(s.finals) }));
  return pageMeta({ title: say("season.metaTitle", { label: s.label, league: LG[league] }), description: `${parts.join(say("sentence.sep"))}${say("sentence.end")}`, path: seasonPath(league, y), locale });
}

export default async function SeasonPage({ params, searchParams }: PageProps<"/[league]/[year]">) {
  const { league: lg, year } = await params;
  const ys = isLeague(lg) ? parseSeasonSeg(lg, year) : null;
  if (!isLeague(lg) || !ys) notFound();
  const y = ys.y;
  const sp = await searchParams;
  if (!ys.canonical) permanentRedirect(withQuery(seasonPath(lg, y), sp));
  const { say, plural, fmt, dt, locale } = await currentSpeaker();
  const [d, brands, abbrs, summary, notes, paths] = await Promise.all([getSeason(lg, y), getBrands(), getAbbrs(lg), getSummary(), getSeasonNotes(lg, y), getPaths()]);
  if (!d) {
    if (!isGapYear(summary.seasons, lg, y)) notFound();
    return (
      <>
        <AccentStyle league={lg} />
        <section className="head fade">
          <nav className="seasonnav" aria-label={say("season.otherSeasons")}>
            <Link href={seasonPath(lg, y - 1)} rel="prev">{"← " + seasonLabel(lg, y - 1)}</Link>
            <Link href={seasonPath(lg, y + 1)} rel="next">{seasonLabel(lg, y + 1) + " →"}</Link>
          </nav>
          <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
          <h1>{say("season.title", { label: seasonLabel(lg, y) })}</h1>
          <p><NoSeason /></p>
        </section>
      </>
    );
  }
  const complete = summary.seasons.some((x) => x.league === lg && x.year === y && x.champion);
  const note = scheduleNote({ say, plural, locale }, notes, lg, y, d.standings, complete);
  const holders = titleHolders(summary.seasons, lg);
  const defending = holders.byYear.get(y - 1)?.champion_franchise;
  const selection = parseSelection(sp);

  const champ = d.awards.find((x) => x.kind === "championship");
  const awards = d.awards.filter((x) => x.kind !== "championship");
  // The table as it stood after a day's games (?date=), when that day is before the season's last game day.
  const days = [...new Set(d.games.filter((g) => g[5] === "r" && g[6] === "f").map((g) => g[0]))].sort();
  const dateWanted = dateSchema.parse(sp.date);
  const dateAsked = dateWanted && days.length && dateWanted < days[days.length - 1] ? dateWanted : "";
  const asOfRows = dateAsked ? await getStandingsAsOf(lg, y, dateAsked) : null;
  const asOf = asOfRows?.length ? asOfRows : null;
  const asOfDate = asOf ? dateAsked : "";
  const st = asOf ? [...asOf].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0)) : d.standings;
  const views = availableViews(lg, y, st);
  const wantedView = viewSchema.parse(sp.view);
  const view = views.includes(wantedView) ? wantedView : "league";
  const grouped = groupStandings(say, st, view);
  const pub = d.standings.find((r) => r.basis === "published");
  const basis = asOf ? say("season.basisAsOf") : pub ? (isSpx(pub.source) ? say("season.basisSpx") : say("season.basisSource", { source: srcName(say, pub.source) })) : say("season.basisDerived");
  const standingsNote = [
    say("season.standingsNote", { basis }),
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
          <TeamLogo url={logoFor(brands, r.franchise_id, y)} />
          <Link href={played.has(r.team_id) ? paths.teamSeason(lg, r.franchise_id, y) : paths.team(lg, r.franchise_id)} prefetch={false}><span className="tn-long">{r.team}</span><abbr className="tn-short" title={r.team ?? undefined}>{abbrFor(abbrs, r.franchise_id, y, r.team)}</abbr></Link>
          {defending != null && r.franchise_id === defending ? (
            <span className="defending" title={say("season.wonTitle", { season: seasonLabel(lg, y - 1) })}>{say("season.defending")}</span>
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
  if (view !== "league") standings.rows.forEach((r, i) => { r.group = grouped.of[i]; });
  const sort = parseSort(sp.sort, cols.map((c) => c.key), "pct.desc");
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <nav className="seasonnav" aria-label={say("season.otherSeasons")}>
          <Link href={seasonPath(lg, y - 1)} rel="prev">{"← " + seasonLabel(lg, y - 1)}</Link>
          <Link href={leadersPath(lg, y)} prefetch={false}>{say("leaders.link")}</Link>
          <Link href={seasonPath(lg, y + 1)} rel="next">{seasonLabel(lg, y + 1) + " →"}</Link>
        </nav>
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("season.title", { label: d.label })}</h1>
        {d.games.length === 0 && !champ && summary.seasons.some((s) => s.league === lg && s.year === y && leagueSat(s))
          ? <p><NoSeason /></p>
          : <p className="lede">{say("season.lede", { games: plural("count.regularGames", regular.length), finals: fmt(regular.filter((g) => g[6] === "f").length) })}</p>}
        <SeasonBar lg={lg} year={y}
          seasons={summary.seasons.filter((x) => x.league === lg).sort((a, b) => b.year - a.year).map((x) => ({ year: x.year, label: x.label }))}
          days={days} date={asOfDate} />
      </section>
      {champ ? (
        <section className="banner">
          <span className="cup">{champ.award}</span>
          <Badge src={champ.source} />
          <span className="who"><TeamLogo url={logoFor(brands, champ.franchise_id, y)} size={32} /><TeamLink lg={lg} f={champ.franchise_id} name={champ.winner} year={d.teams.some((t) => t.f === champ.franchise_id && played.has(t.id)) ? y : undefined} /></span>
          <span className="how"><ChampionNote lg={lg} year={y} champ={champ.franchise_id} note={champ.note} /></span>
        </section>
      ) : null}
      {st.length ? (
        <section className="section">
          <h2>{say("season.standings")}</h2>
          {asOfDate ? (
            <div className="asof">
              <b>{say("season.asOf", { date: dt.full(atUtc(asOfDate)) })}</b>
              <Link href={queryHref(seasonPath(lg, y), sp, { date: null })} prefetch={false} scroll={false}>{say("season.backFinal")}</Link>
            </div>
          ) : null}
          <ViewTabs lg={lg} path={seasonPath(lg, y)} sp={sp} view={view} views={views} rows={st} />
          <p className="note">{standingsNote}</p>
          <div className="scroll"><SortTable {...standings} def="pct.desc" initial={sort} groups={view === "league" ? undefined : grouped.groups} /></div>
        </section>
      ) : null}
      <SeasonPlayoffs lg={lg} year={y} />
      {awards.length ? (
        <section className="section">
          <h2>{say("season.awards")}</h2>
          <div className="awards">
            {awards.map((a, i) => (
              <div className="award" key={i}>
                <span className="name">{a.award}</span>
                <span className="winner">{a.person_id != null ? <Link href={`/players/${a.person_id}`} prefetch={false}>{a.winner}</Link> : <TeamLink lg={lg} f={a.franchise_id} name={a.winner} year={d.teams.some((t) => t.f === a.franchise_id && played.has(t.id)) ? y : undefined} />}</span>
                <span className="note">{a.note || ""} <Badge src={a.source} /></span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {d.games.length ? (
        <section className="section">
          <h2>{say("season.games")}</h2>
          {note ? <p className="note">{note.text}{note.src ? <>{" "}<a href={note.src} rel="noopener noreferrer">{say("sched.source")}</a></> : null}</p> : null}
          <SeasonGames lg={lg} abbrs={abbrs} year={y} games={d.games} teams={d.teams} initial={selection} />

        </section>
      ) : null}
    </>
  );
}
