import LoadNote from "@/components/LoadNote";
import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { CompareChart, type ComparePoint } from "@/components/CompareChart";
import { ResultHeat } from "@/components/ResultHeat";
import { ResultHeatLazy } from "@/components/ResultHeatLazy";
import { CompareTextRow, H2hCompareRow, type H2hMetric } from "@/components/H2hCompare";
import { H2hPicker } from "@/components/H2hPicker";
import { H2hSeasonSelect } from "@/components/H2hSeasonSelect";
import { SeriesStyle } from "@/components/SeriesStyle";
import { TeamLogo } from "@/components/TeamLogo";
import { Figures } from "@/components/ui";
import "@/components/h2h.css";
import "@/components/series.css";
import { abbrFor } from "@/lib/abbr";
import { titleHolders } from "@/lib/champions";
import { brandFor, logoFor } from "@/lib/brand";
import { compareHref, parseCompareQuery, rankIn, runOf, sameConference, sameDivision, streaksOf, type Streaks } from "@/lib/compare";
import { getAbbrs, getBrands, getSeasonStandings, getSummary, getTeam, getTeamGames, getTeamStandings, type TeamData } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { h2hGames, pairPath, tally } from "@/lib/h2h";
import { getPairHistory } from "@/lib/h2hData";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { RESULT_KEY } from "@/lib/i18n/keys";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel, seasonSeg } from "@/lib/leagues";
import { addRec, recordAt, share, type Rec } from "@/lib/loc";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { nickname } from "@/lib/series";
import { seriesLooks } from "@/lib/seriesLooks";
import { withQuery } from "@/lib/slug";
import { heatGamesFromTeam } from "@/lib/resultHeat";
import { deriveTeamGames, seasonRecord } from "@/lib/teamSeason";
import { getLeagueClubs, getPaths, compareOf } from "@/lib/teamSlugs";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/[league]/compare/[pair] keeps this page and revalidates it every day. The data behind it keeps its one-day cache (lib/api/client.ts).

const UNIT = { nhl: "unit.goals", pwhl: "unit.goals", nba: "unit.points", wnba: "unit.points", mlb: "unit.runs", nfl: "unit.points", cfl: "unit.points", nwsl: "unit.goals", afl: "unit.points", aafc: "unit.points", nha: "unit.goals", pcha: "unit.goals", wchl: "unit.goals", wha: "unit.goals" } as const satisfies Record<string, PhraseKey>;

const signed = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
/** The side with the better figure (the lower one when `low`), or none when level or missing. */
const better = (a: number | null, b: number | null, low = false): 0 | 1 | null => (a == null || b == null || a === b ? null : (a > b) !== low ? 0 : 1);

interface Side {
  f: number;
  name: string;
  rec: Rec;
  /** Standings row of the season (season view). */
  st: Awaited<ReturnType<typeof getSeasonStandings>>[number] | null;
  team: TeamData | null;
}

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/q/[league]/compare/[pair]">): Promise<Metadata> => {
  const { league, pair } = await params;
  if (!isLeague(league)) return {};
  const at = await compareOf(league, pair);
  if (!at) return {};
  const [{ say, locale }, ta, tb] = await Promise.all([currentSpeaker(), getTeam(league, at.a), getTeam(league, at.b)]);
  const na = ta?.names.at(-1)?.name ?? say("team.fallback", { id: at.a }), nb = tb?.names.at(-1)?.name ?? say("team.fallback", { id: at.b });
  return { ...pageMeta({ title: say("compare.metaTitle", { a: na, b: nb, league: LG[league] }), description: say("compare.metaDesc", { a: na, b: nb, league: LG[league] }), path: at.path, locale }), robots: { index: false, follow: false } };
});

export default guard(async function ComparePage({ params, searchParams }: PageProps<"/[locale]/q/[league]/compare/[pair]">) {
  const { league: lg, pair } = await params;
  if (!isLeague(lg)) notFound();
  const at = await compareOf(lg, pair);
  if (!at) notFound();
  const sp = await searchParams;
  const q = parseCompareQuery(sp, lg);
  if (at.path !== `/${lg}/compare/${pair}` || !q.canonicalSeason) {
    permanentRedirect(withQuery(at.path, q.year != null && !q.canonicalSeason ? { ...sp, season: seasonSeg(lg, q.year) } : sp));
  }
  const { a, b } = at;
  const path = at.path;
  const { say, plural, fmt } = await currentSpeaker();
  const eyebrow = <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}{say("compare.eyebrow")}</span>;
  const failed = <><AccentStyle league={lg} /><section className="head fade">{eyebrow}<h1>{say("compare.eyebrow")}</h1></section><LoadNote /></>;

  let paths: Awaited<ReturnType<typeof getPaths>>, clubs: Awaited<ReturnType<typeof getLeagueClubs>>, brands: Awaited<ReturnType<typeof getBrands>>, abbrs: Awaited<ReturnType<typeof getAbbrs>>, ta: TeamData | null, tb: TeamData | null;
  try {
    [paths, clubs, brands, abbrs, ta, tb] = await Promise.all([getPaths(), getLeagueClubs(lg), getBrands(), getAbbrs(lg), getTeam(lg, a), getTeam(lg, b)]);
  } catch {
    return failed;
  }
  const yearsOf = (t: TeamData | null) => new Set((t?.seasons ?? []).map((s) => s[0]));
  const yb = yearsOf(tb);
  const common = [...yearsOf(ta)].filter((y) => yb.has(y)).sort((x, y) => y - x);
  // No ?season= is the latest season both played; two clubs with none in common can only be compared all-time.
  const all = q.all || (q.year == null && !common.length);
  const year = all ? null : q.year ?? common[0] ?? null;
  const label = year != null ? seasonLabel(lg, year) : null;
  const fallback = (f: number) => say("team.fallback", { id: f });
  const baseName = (t: TeamData | null, f: number) => t?.names.at(-1)?.name ?? fallback(f);
  const logoYear = year ?? undefined;
  const [la, lb] = seriesLooks(lg, brandFor(brands, a, logoYear), brandFor(brands, b, logoYear));
  const unit = say(UNIT[lg]);

  const pickerClubs = clubs.map((c) => ({ ...c, alt: c.alt.slice(0, 6), logo: logoFor(brands, c.f) }));
  const head = (names: readonly [string, string]) => (
    <section className="head fade">
      {eyebrow}
      <h1>{say("h2h.title", { a: names[0], b: names[1] })}</h1>
      <H2hPicker kind="compare" lg={lg} a={a} b={b} names={names} logos={[logoFor(brands, a, logoYear), logoFor(brands, b, logoYear)]} clubs={pickerClubs} />
    </section>
  );
  const seasonOptions = common.map((y) => ({ label: seasonLabel(lg, y) }));
  const controls = (
    <div className="h2hcontrols">
      <label>{say("col.season")}<H2hSeasonSelect seasons={seasonOptions} value={label ?? "all"} all="all" allLabel={say("compare.allTime")} /></label>
      <nav className="seg views" aria-label={say("compare.range.aria")}>
        {common.length ? <Link href={compareHref(path, seasonSeg(lg, common[0]))} prefetch={false} scroll={false} aria-current={!all ? "page" : undefined}>{say("compare.range.season")}</Link> : null}
        <Link href={compareHref(path, "all")} prefetch={false} scroll={false} aria-current={all ? "page" : undefined}>{say("compare.allTime")}</Link>
      </nav>
    </div>
  );

  const names0 = [baseName(ta, a), baseName(tb, b)] as const;
  if (!ta || !tb) return <>{<AccentStyle league={lg} />}{head(names0)}<LoadNote /></>;

  // ---- what each side brings: a season's standings row and games, or every season added up ----
  let sides: [Side, Side];
  let rowsAll: Awaited<ReturnType<typeof getSeasonStandings>> = [];
  let games: [ReturnType<typeof deriveTeamGames>, ReturnType<typeof deriveTeamGames>] = [[], []];
  let rawA: Awaited<ReturnType<typeof getTeamGames>> = [];
  const allRows: [Awaited<ReturnType<typeof getTeamStandings>>, Awaited<ReturnType<typeof getTeamStandings>>] = [[], []];
  let history: Awaited<ReturnType<typeof getPairHistory>> = [];
  let champion: number | null = null;
  try {
    if (year != null) {
      let rawB: typeof rawA;
      let summary: Awaited<ReturnType<typeof getSummary>>;
      [rowsAll, rawA, rawB, summary] = await Promise.all([getSeasonStandings(lg, year), getTeamGames(lg, year, a), getTeamGames(lg, year, b), getSummary()]);
      champion = titleHolders(summary.seasons, lg).byYear.get(year)?.champion_franchise ?? null;
      const sa = rowsAll.find((r) => r.franchise_id === a) ?? null, sb = rowsAll.find((r) => r.franchise_id === b) ?? null;
      games = [deriveTeamGames(rawA, a, sa), deriveTeamGames(rawB, b, sb)];
      sides = [
        { f: a, name: sa?.team || names0[0], rec: seasonRecord(games[0], sa), st: sa, team: ta },
        { f: b, name: sb?.team || names0[1], rec: seasonRecord(games[1], sb), st: sb, team: tb },
      ];
    } else {
      let hist: typeof history;
      [allRows[0], allRows[1], hist] = await Promise.all([getTeamStandings(lg, a), getTeamStandings(lg, b), getPairHistory(lg, a, b)]);
      history = hist;
      const total = (rows: typeof allRows[0]): Rec => rows.reduce<Rec>((r, s) => ({ w: r.w + (s.w ?? 0), l: r.l + (s.l ?? 0), t: r.t + (s.t ?? 0), otl: r.otl + (s.otl ?? 0) }), { w: 0, l: 0, t: 0, otl: 0 });
      sides = [
        { f: a, name: names0[0], rec: total(allRows[0]), st: null, team: ta },
        { f: b, name: names0[1], rec: total(allRows[1]), st: null, team: tb },
      ];
    }
  } catch {
    return <><AccentStyle league={lg} />{head(names0)}{controls}<LoadNote /></>;
  }
  const [A, B] = sides;
  const name = [A.name, B.name] as const;
  const [na, nb] = [nickname(name[0]), nickname(name[1])];

  // A season one of them sat out: say which, and offer all-time.
  if (year != null && (!A.st || !B.st)) {
    const missing = [!A.st ? name[0] : null, !B.st ? name[1] : null].filter(Boolean).join(" · ");
    return (
      <>
        <AccentStyle league={lg} />
        {head(names0)}
        {controls}
        <p className="note">{say("compare.notPlayed", { team: missing, season: label ?? "" })}</p>
        <p><Link href={compareHref(path, "all")}>{say("compare.seeAllTime")}</Link></p>
      </>
    );
  }

  // ---- the rows ----
  const bars: H2hMetric[] = [];
  const plain: { label: string; a: string; b: string; best?: 0 | 1 | null }[] = [];
  const dash = "—";
  const withShare = (x: Rec | null, y: Rec | null) => ({ a: share(x), b: share(y), ta: x ? recordText(x) : null, tb: y ? recordText(y) : null });
  const sumRec = (rows: typeof allRows[0], loc: "home" | "road") => rows.reduce<Rec | null>((r, s) => { const v = recordAt(s, loc); return v ? addRec(r ?? { w: 0, l: 0, t: 0, otl: 0 }, v) : r; }, null);
  const sumN = (rows: typeof allRows[0], k: "pf" | "pa") => (rows.some((s) => s[k] != null) ? rows.reduce((n, s) => n + (s[k] ?? 0), 0) : null);

  let pfa: [number | null, number | null], paa: [number | null, number | null], homes: [Rec | null, Rec | null], roads: [Rec | null, Rec | null];
  if (year != null) {
    pfa = [A.st!.pf, B.st!.pf]; paa = [A.st!.pa, B.st!.pa];
    homes = [recordAt(A.st!, "home"), recordAt(B.st!, "home")]; roads = [recordAt(A.st!, "road"), recordAt(B.st!, "road")];
  } else {
    pfa = [sumN(allRows[0], "pf"), sumN(allRows[1], "pf")]; paa = [sumN(allRows[0], "pa"), sumN(allRows[1], "pa")];
    homes = [sumRec(allRows[0], "home"), sumRec(allRows[1], "home")]; roads = [sumRec(allRows[0], "road"), sumRec(allRows[1], "road")];
    bars.push({ label: say("compare.row.seasons"), a: allRows[0].length, b: allRows[1].length, text: (v) => fmt(v) });
    bars.push({ label: say("compare.row.titles"), a: ta.titles.length, b: tb.titles.length, text: (v) => fmt(v) });
  }
  const shareA = share(A.rec), shareB = share(B.rec);
  bars.push({ label: say("fig.wins"), a: A.rec.w, b: B.rec.w, text: (v) => fmt(v) });
  bars.push({ label: say("fig.share"), a: shareA, b: shareB, text: fmt3, ta: recordText(A.rec), tb: recordText(B.rec) });
  if (year != null && A.st!.pts != null && B.st!.pts != null) bars.push({ label: say("fig.points"), a: A.st!.pts, b: B.st!.pts, text: (v) => fmt(v) });
  if (pfa[0] != null && pfa[1] != null) bars.push({ label: say("h2h.cmp.for", { unit }), a: pfa[0], b: pfa[1], text: (v) => fmt(v) });
  if (paa[0] != null && paa[1] != null) bars.push({ label: say("compare.row.against", { unit }), a: paa[0], b: paa[1], text: (v) => fmt(v), low: true });
  if (pfa[0] != null && pfa[1] != null && paa[0] != null && paa[1] != null) {
    bars.push({ label: say("compare.row.diff", { unit }), a: pfa[0] - paa[0]!, b: pfa[1] - paa[1]!, text: signed });
  }
  if (homes[0] && homes[1]) bars.push({ label: say("compare.row.home"), ...withShare(homes[0], homes[1]), text: fmt3 });
  if (roads[0] && roads[1]) bars.push({ label: say("compare.row.road"), ...withShare(roads[0], roads[1]), text: fmt3 });

  let sa: Streaks | null = null, sb: Streaks | null = null;
  if (year != null) {
    const [x, y] = [A.st!, B.st!];
    const inLeague = () => true;
    const rank = (r: ReturnType<typeof rankIn>) => (r ? say("compare.rank", { place: fmt(r.place), of: fmt(r.of) }) : dash);
    const addRank = (label: string, ra: ReturnType<typeof rankIn>, rb: ReturnType<typeof rankIn>) => plain.push({ label, a: rank(ra), b: rank(rb), best: better(ra?.place ?? null, rb?.place ?? null, true) });
    addRank(say("compare.row.rankLeague"), rankIn(rowsAll, a, inLeague), rankIn(rowsAll, b, inLeague));
    if (x.conference || y.conference) {
      addRank(say("compare.row.rankConf"), x.conference ? rankIn(rowsAll, a, sameConference(x)) : null, y.conference ? rankIn(rowsAll, b, sameConference(y)) : null);
      plain.push({ label: say("compare.row.conf"), a: x.conference_short ?? x.conference ?? dash, b: y.conference_short ?? y.conference ?? dash });
    }
    if (x.division || y.division) {
      addRank(say("compare.row.rankDiv"), x.division ? rankIn(rowsAll, a, sameDivision(x)) : null, y.division ? rankIn(rowsAll, b, sameDivision(y)) : null);
      plain.push({ label: say("compare.row.div"), a: x.division_short ?? x.division ?? dash, b: y.division_short ?? y.division ?? dash });
    }
    sa = streaksOf(games[0]); sb = streaksOf(games[1]);
    plain.push({ label: say("compare.row.winStreak"), a: fmt(sa.win), b: fmt(sb.win), best: better(sa.win, sb.win) });
    plain.push({ label: say("compare.row.lossStreak"), a: fmt(sa.loss), b: fmt(sb.loss), best: better(sa.loss, sb.loss, true) });
    const ended = (s: Streaks) => (s.last ? `${say(RESULT_KEY[s.last.res])}${s.last.n}` : dash);
    plain.push({ label: say("compare.row.ended"), a: ended(sa), b: ended(sb) });
    plain.push({ label: say("compare.row.titles"), a: fmt(ta.titles.length), b: fmt(tb.titles.length), best: better(ta.titles.length, tb.titles.length) });
    if (champion != null && (champion === a || champion === b)) plain.push({ label: say("compare.row.champ"), a: champion === a ? say("compare.yes") : dash, b: champion === b ? say("compare.yes") : dash, best: champion === a ? 0 : 1 });
  }

  // ---- the running chart: both clubs' wins minus losses, game by game or season by season ----
  const diffText = (rec: string, diff: number) => say("compare.tip.rec", { rec, diff: signed(diff) });
  let series: [{ name: string; points: ComparePoint[] }, { name: string; points: ComparePoint[] }];
  if (year != null) {
    const pts = (g: typeof games[0]): ComparePoint[] => runOf(g).map((p) => ({ x: p.n, y: p.diff, title: say("compare.tip.game", { n: fmt(p.n) }), line: diffText(p.g.rec, p.diff) }));
    series = [{ name: na, points: pts(games[0]) }, { name: nb, points: pts(games[1]) }];
  } else {
    const pts = (rows: typeof allRows[0]): ComparePoint[] => {
      let diff = 0;
      return [...rows].sort((x, y) => x.year - y.year).filter((r) => r.w != null).map((r) => {
        diff += (r.w ?? 0) - (r.l ?? 0) - (r.otl ?? 0);
        return { x: r.year, y: diff, title: seasonLabel(lg, r.year), line: diffText(recordText({ w: r.w ?? 0, l: r.l ?? 0, t: r.t, otl: r.otl }), diff) };
      });
    };
    series = [{ name: na, points: pts(allRows[0]) }, { name: nb, points: pts(allRows[1]) }];
  }

  // ---- head to head, from the season's games already fetched, or from the pair's whole history ----
  const meet = h2hGames(lg, year != null ? rawA : history, a, b).filter((g) => year == null || g.year === year);
  const mt = tally(meet, lg);
  const h2hPath = pairPath(paths, lg, a, b).path;
  const h2hHref = year != null ? `${h2hPath}?season=${label}` : h2hPath;

  const side = (i: 0 | 1) => {
    const S = i === 0 ? A : B, f = S.f;
    const sh = i === 0 ? shareA : shareB;
    const logo = logoFor(brands, f, logoYear);
    const st = S.st;
    return (
      <div className={`sdside ${i === 0 ? "a" : "b"}`}>
        {logo ? <TeamLogo url={logo} size={88} shape="circle" /> : <span className="crest"><span className="mono">{abbrFor(abbrs, f, year ?? seasonsEnd(S.team), S.name)}</span></span>}
        <h2 className="sdname"><Link href={year != null ? paths.teamSeason(lg, f, year) : paths.team(lg, f)} prefetch={false}>{S.name}</Link></h2>
        <span className="sdmeta">{say("h2h.side.record", { record: recordText(S.rec) })}{sh == null ? "" : ` · ${say("h2h.side.share", { share: fmt3(sh) })}`}</span>
        {st && (st.conference_short || st.division_short) ? <span className="sdmeta">{[st.conference_short, st.division_short].filter(Boolean).join(" · ")}</span> : null}
        <span className="sdlinks">
          {year != null ? <Link href={paths.teamSeason(lg, f, year)} prefetch={false}>{say("team.everyGame", { season: label ?? "" })}</Link> : null}
          <Link href={paths.team(lg, f)} prefetch={false}>{say("tseason.allSeasons")}</Link>
        </span>
      </div>
    );
  };

  return (
    <>
      <AccentStyle league={lg} />
      <SeriesStyle a={la} b={lb} />
      {head(names0)}
      <p className="lede">{year != null ? say("compare.ledeSeason", { season: label ?? "" }) : say("compare.ledeAll")}</p>
      {controls}

      <section className="showdown" aria-label={say("h2h.title", { a: name[0], b: name[1] })}>
        {side(0)}
        <div className="sdmid">
          <span className="verdict">{say("compare.vs")}</span>
          <span className="sdnote">{label ?? say("compare.allTime")}</span>
        </div>
        {side(1)}
      </section>

      <section className="section">
        <h2>{say("h2h.cmp.title")}</h2>
        <p className="note">{say(year != null ? "compare.note.season" : "compare.note.all")}</p>
        <div className="cmp">
          <div className="cmphead"><b style={{ color: "var(--ca)" }}>{na}</b><span /><b style={{ color: "var(--cb)" }}>{nb}</b></div>
          {bars.map((m) => <H2hCompareRow key={m.label} m={m} />)}
          {plain.map((p) => <CompareTextRow key={p.label} label={p.label} a={p.a} b={p.b} best={p.best} />)}
        </div>
      </section>

      <section className="section">
        <h2>{say("rheat.title")}</h2>
        <p className="note">{say(year != null ? "rheat.ledeSeason" : "rheat.lede")}</p>
        <div className="cmp">
          <div className="cmphead"><b style={{ color: "var(--ca)" }}>{na}</b><span /><b style={{ color: "var(--cb)" }}>{nb}</b></div>
          <div className="rheat-pair">
            {year != null
              ? <ResultHeat lg={lg} games={heatGamesFromTeam(games[0], year, A.name)} compact />
              : <ResultHeatLazy teamPath={paths.team(lg, a)} lg={lg} compact />}
            {year != null
              ? <ResultHeat lg={lg} games={heatGamesFromTeam(games[1], year, B.name)} compact />
              : <ResultHeatLazy teamPath={paths.team(lg, b)} lg={lg} compact />}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>{say("compare.chart.title")}</h2>
        <p className="note">{say(year != null ? "compare.chart.noteGame" : "compare.chart.noteSeason")}</p>
        <CompareChart series={series} steps={year == null} aria={say("compare.chart.aria", { a: na, b: nb })} none={say("chart.noResults")} />
      </section>

      <section className="section">
        <h2>{say("h2h.eyebrow")}</h2>
        {meet.length ? (
          <>
            <Figures items={[
              [say("fig.games"), mt.gp],
              [say("compare.h2h.wins", { team: na }), mt.a.w],
              [say("compare.h2h.wins", { team: nb }), mt.b.w],
              ...(mt.a.t ? [[say("fig.ties"), mt.a.t] as [string, number]] : []),
              [unit, `${fmt(mt.af)} – ${fmt(mt.bf)}`],
            ]} />
            <p className="note">{year != null ? say("compare.h2h.noteSeason", { games: plural("count.games", mt.gp), season: label ?? "" }) : say("compare.h2h.noteAll", { games: plural("count.games", mt.gp) })}</p>
          </>
        ) : (
          <p className="note">{year != null ? say("h2h.noSeason", { a: name[0], b: name[1], season: label ?? "" }) : say("h2h.never", { a: name[0], b: name[1] })}</p>
        )}
        {meet.length || year != null ? <p><Link href={h2hHref} prefetch={false}>{say("compare.h2h.link")}</Link>{year != null ? <>{" · "}<Link href={h2hPath} prefetch={false}>{say("compare.h2h.linkAll")}</Link></> : null}</p> : null}
      </section>
    </>
  );
});

/** The last season a club has on record, for the abbreviation of its crest when it has no logo. */
function seasonsEnd(t: TeamData | null): number {
  return t?.seasons.at(-1)?.[0] ?? 0;
}
