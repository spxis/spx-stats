import type { Metadata } from "next";
import Link from "@/components/Link";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { OfficialLinks } from "@/components/OfficialLinks";
import { GameLeaders } from "@/components/GameLeaders";
import { GameState } from "@/components/GameState";
import { GameSurface, placeOf, type DrawnGame } from "@/components/GameSurface";
import { SeriesStyle } from "@/components/SeriesStyle";
import { Showdown, type ShowdownSide } from "@/components/Showdown";
import { Rich } from "@/components/i18n/Rich";
import { TeamLabel } from "@/components/TeamLabel";
import { TeamLogo } from "@/components/TeamLogo";
import { Badge } from "@/components/ui";
import { canFallBack } from "@/lib/api/soften";
import type { GameRow, StandingRow } from "@/lib/api/types";
import { abbrFor, officialAbbr } from "@/lib/abbr";
import { brandFor, logoFor } from "@/lib/brand";
import { getAbbrs, getBrands, getSeasonStandings } from "@/lib/data";
import { atUtc } from "@/lib/format";
import { gamePath, parseGameSegment } from "@/lib/gamePath";
import { getClubGames, getFranchiseRows, getGame } from "@/lib/gameData";
import { around, countsOtl, formBefore, goingInto, headOf, inOrder, inSeason, isFinal, meetingsAround, resultFor, timelineOf, type Lite, type PairGame, type Result } from "@/lib/gameView";
import { pairPath } from "@/lib/h2h";
import { getPairHistory } from "@/lib/h2hData";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { isLeague, LG, seasonLabel, type LeagueCode } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { roundSay } from "@/lib/roundWords";
import { scoresPath } from "@/lib/scores";
import { datedRound, deriveSeries, describeRounds, nickname, playedYear, rankIn, roundPath, roundTitle, seriesPath } from "@/lib/series";
import { seriesLooks } from "@/lib/seriesLooks";
import { getPlayoffGames } from "@/lib/seriesData";
import { seasonPath } from "@/lib/slug";
import { getFigureRanks } from "@/lib/teamFigures";
import { getPaths } from "@/lib/teamSlugs";
import "@/components/series.css";
import "@/components/game.css";

// Historical: a finished game changes only through a release (tag revalidate). Crawlers are blocked (robots.txt).
export const revalidate = 2592000;
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/[league]/[year]/game/[game]">;

/** A read the page can do without: a failed one leaves its section out (and the page is redrawn within seconds, as for every failed read), anything else is a real error. */
const soft = <T,>(p: Promise<T>): Promise<T | null> => p.catch((e) => { if (canFallBack(e)) return null; throw e; });

/** The game an address names, with the address it should have; null when there is no such game in that league. */
async function find(league: string, seg: string) {
  const id = isLeague(league) ? parseGameSegment(seg) : null;
  if (!isLeague(league) || id == null) return null;
  const game = await getGame(league, id);
  return game ? { lg: league as LeagueCode, game, path: gamePath(league, game.year, game.game_id, game.away, game.home) } : null;
}

const scoreOf = (g: Pick<GameRow, "away_score" | "home_score">): string => `${g.away_score}–${g.home_score}`;

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { league, game: seg } = await params;
  const found = await find(league, seg);
  if (!found) return {};
  const { lg, game: g, path } = found;
  const { say, dt, locale } = await currentSpeaker();
  const away = g.away ?? "—", home = g.home ?? "—";
  const date = dt.full(atUtc(g.game_date));
  const final = isFinal(g);
  const title = final ? say("gm.metaTitleFinal", { away, awayScore: g.away_score!, home, homeScore: g.home_score!, date: dt.ymd(atUtc(g.game_date)) }) : say("gm.metaTitle", { away, home, date: dt.ymd(atUtc(g.game_date)) });
  return {
    ...pageMeta({ title, description: say(final ? "gm.metaDesc" : "gm.metaDescPending", { away, home, league: LG[lg], season: seasonLabel(lg, g.year), date }), path, locale }),
    robots: { index: false, follow: false },
  };
});

const tally = (t: { w: number; l: number; t: number; otl: number }, otl: boolean) => recordText({ w: t.w, l: t.l, t: t.t, otl: otl ? t.otl : 0 });

export default guard(async function GamePage({ params }: Params) {
  const { league, year, game: seg } = await params;
  const found = await find(league, seg);
  if (!found) notFound();
  const { lg, game: g, path } = found;
  // One address per game: the season as the site writes it, the id, and the two clubs by that season's names.
  if (`/${league}/${year}/game/${seg}` !== path) permanentRedirect(path);
  const y = g.year;
  const sp = await currentSpeaker();
  const { say, dt, fmt } = sp;
  const rs = roundSay(sp);

  const fa = g.away_f, fh = g.home_f;
  const pair = fa != null && fh != null && fa !== fh;
  const final = isFinal(g);
  const playoffs = g.phase === "playoffs";
  const drawn: DrawnGame = {
    id: g.game_id, date: g.game_date, phase: g.phase, overtime: !!g.overtime,
    home: { f: fh, name: g.home ?? "", score: g.home_score }, away: { f: fa, name: g.away ?? "", score: g.away_score },
  };
  const [brands, abbrs, paths, club, standings, history, franchises, playoffGames, ranks] = await Promise.all([
    getBrands(), getAbbrs(lg), getPaths(),
    soft(getClubGames(lg, y, g.away_id, g.home_id)),
    soft(getSeasonStandings(lg, y)),
    pair ? soft(getPairHistory(lg, fa!, fh!)) : Promise.resolve(null),
    soft(getFranchiseRows(lg, [fa, fh].filter((f): f is number => f != null))),
    playoffs ? soft(getPlayoffGames(lg, y)) : Promise.resolve(null),
    fa != null && fh != null ? Promise.all([getFigureRanks(lg, y, fa), getFigureRanks(lg, y, fh)]) : Promise.resolve([[], []] as const),
  ]);

  // The series this game belongs to, and where it stands after it.
  const all = playoffGames ? deriveSeries(lg, y, playoffGames) : [];
  const series = all.find((s) => s.games.some((x) => x.id === g.game_id)) ?? null;
  const sg = series?.games.find((x) => x.id === g.game_id) ?? null;
  const desc = series ? describeRounds(lg, y, all, rs) : null;
  const roundNo = series && desc ? desc.round[all.indexOf(series)] : 0;
  const round = series && desc ? roundTitle(desc.names, roundNo, sp.say("playoffs.robin")) : "";
  const isFinalRound = !!desc && roundNo === desc.final && desc.final > 0;
  drawn.final = isFinalRound && series?.games.at(-1)?.id === g.game_id;
  const roundDated = series && desc && round ? datedRound(lg, y, playedYear(series), round, isFinalRound, rs) : "";

  const { venue, neutral } = await placeOf(lg, y, drawn, brands);
  const otl = countsOtl(lg, y);
  const season = seasonLabel(lg, y);
  const date = dt.full(atUtc(g.game_date));
  const extra = say(lg === "mlb" ? "game.extras" : "game.ot");
  const state = final ? (g.overtime ? say("scores.finalExtra", { extra }) : say("scores.final")) : g.status === "scheduled" ? say("scores.scheduled") : say("scores.noResult");
  const winner: 0 | 1 | null = final && g.away_score! !== g.home_score! ? (g.away_score! > g.home_score! ? 0 : 1) : null;

  const games: Lite[] = club ?? [];
  const meetings: PairGame[] = history ?? [];
  // Every other game the page links to: its address needs both clubs' names.
  const linkTo = (x: Pick<Lite, "game_id" | "away" | "home">) => gamePath(lg, y, x.game_id, x.away, x.home);
  const rowOf = (f: number | null): StandingRow | undefined => (f == null ? undefined : standings?.find((r) => r.franchise_id === f));

  const sides = ([0, 1] as const).map((i) => {
    const away = i === 0;
    const tid = away ? g.away_id : g.home_id, f = away ? fa : fh, name = (away ? g.away : g.home) ?? "—";
    const timeline = timelineOf(games, tid, g.phase);
    const going = timeline.some((x) => x.game_id === g.game_id) ? goingInto(timeline, g, tid, otl) : null;
    const near = around(timeline, g);
    const st = rowOf(f);
    return {
      i, away, tid, f, name, score: away ? g.away_score : g.home_score, logo: logoFor(brands, f, y), abbr: abbrFor(abbrs, f, y, name),
      timeline, going, prev: near.prev, next: near.next, form: formBefore(timeline, g, tid, otl), st,
      rank: st && standings ? rankIn(standings, st.franchise_id) : null, figures: ranks[i], franchise: franchises?.find((r) => r.franchise_id === f) ?? null,
      result: resultFor(g, tid, otl),
    };
  });
  const [A, H] = sides;
  const [la, lb] = seriesLooks(lg, brandFor(brands, fa, y), brandFor(brands, fh, y));

  const around_ = pair ? meetingsAround(meetings, g) : { prev: null, next: null };
  const thisSeason = pair ? inSeason(meetings, y) : [];
  const head = pair ? headOf(meetings, fa!, fh!) : null;
  const recent = pair ? inOrder(meetings).filter((x) => isFinal(x) && x.game_id !== g.game_id && (x.game_date < g.game_date || (x.game_date === g.game_date && x.game_id < g.game_id))).slice(-6).reverse() : [];
  const h2h = pair ? pairPath(paths, lg, fa!, fh!) : null;

  const standing = (s: (typeof sides)[number]) => (s.st && s.st.w != null ? tally({ w: s.st.w, l: s.st.l ?? 0, t: s.st.t ?? 0, otl: s.st.otl ?? 0 }, true) : null);
  const stateNode = !final && g.status === "scheduled" ? <GameState text={state} status={g.status} startsAt={g.starts_at} gameDate={g.game_date} form="long" /> : state;
  const stateLinked = !final && g.status === "scheduled" ? <GameState text={state} status={g.status} startsAt={g.starts_at} gameDate={g.game_date} form="long" help /> : state;
  const verdict = !final ? stateNode : winner == null ? say("gm.tied") : say("gm.won", { team: sides[winner].name });
  const gameNo = sg && series ? say("gm.gameN", { n: fmt(sg.n) }) : null;
  const seriesState = sg && series ? (() => {
    const [w0, w1] = sg.run;
    if (w0 === w1) return say("gm.seriesTied", { a: fmt(w0), b: fmt(w1) });
    const lead = w0 > w1 ? series.sides[0] : series.sides[1];
    const done = series.winner != null && sg.n === series.games.length;
    return say(done ? "gm.seriesWon" : "gm.seriesLead", { team: nickname(lead.name), a: fmt(Math.max(w0, w1)), b: fmt(Math.min(w0, w1)) });
  })() : null;
  const phaseTag = g.phase === "preseason" ? say("phase.preseason") : g.phase === "all_star" ? say("phase.allStar") : null;
  const competition = playoffs && roundDated ? `${roundDated}${gameNo ? ` · ${gameNo}` : ""}` : phaseTag ?? say("phase.regular");

  /** A side of an earlier meeting of the two clubs: its logo that season, then its name as a link to that season. */
  const clubIn = (x: PairGame, away: boolean) => {
    const f = away ? x.away_f : x.home_f;
    return <TeamLabel lg={lg} f={f} name={(away ? x.away : x.home) ?? "—"} year={x.year} logo={logoFor(brands, f, x.year)} />;
  };
  const chip = (r: Result) => <span className={`gchip ${r}`}>{say(RESULT_KEY[r])}</span>;
  const gameLine = (x: Lite, s: (typeof sides)[number]) => {
    const home = x.home_id === s.tid, r = resultFor(x, s.tid, otl);
    const opp = home ? x.away : x.home;
    return (
      <Link href={linkTo(x)} prefetch={false} className="gline">
        <span className="gd">{dt.monthDayShort(atUtc(x.game_date))}</span>
        <span className="gv">{say(home ? "gm.vs" : "gm.at", { team: opp ?? "—" })}</span>
        {r ? <span className="gr">{chip(r)} {home ? `${x.home_score}–${x.away_score}` : `${x.away_score}–${x.home_score}`}</span> : <span className="gr note"><GameState text={say("scores.scheduled")} status={x.status} gameDate={x.game_date} /></span>}
      </Link>
    );
  };

  const side = (s: (typeof sides)[number]): ShowdownSide => {
    const lines = [
      s.going ? (s.going.number === 1 ? say("gm.firstGame") : say("gm.goingIn", { record: tally(s.going.before, otl), n: fmt(s.going.number - 1) })) : null,
      playoffs && s.going?.season ? say("gm.regularSeason", { record: tally(s.going.season, otl) }) : null,
    ].filter((x): x is string => !!x);
    return {
      crest: s.logo ? <TeamLogo url={s.logo} size={88} shape="circle" /> : <span className="crest"><span className="mono">{s.abbr}</span></span>,
      name: <Link href={s.f != null ? paths.teamSeason(lg, s.f, y) : seasonPath(lg, y)} prefetch={false} title={say("gm.teamSeasonTitle", { team: s.name, season })}>{s.name}</Link>,
      tag: winner === s.i ? say("gm.winnerTag") : null,
      meta: lines,
      links: s.f != null ? [
        <Link key="season" href={paths.teamSeason(lg, s.f, y)} prefetch={false}>{say("gm.teamSeason", { season })}</Link>,
        <Link key="all" href={paths.team(lg, s.f)} prefetch={false}>{say("gm.teamAll")}</Link>,
      ] : [],
      lost: winner != null && winner !== s.i,
    };
  };

  const pending = (x: Lite | null) => x && !isFinal(x);
  const meetingLink = (x: PairGame | null, dir: "prev" | "next") => x ? (
    <Link href={linkTo(x)} prefetch={false} className={`gnavlink ${dir}`}>
      <span className="gnavlab">{say(dir === "prev" ? "gm.prevMeeting" : "gm.nextMeeting")}</span>
      <span className="gnavsub">{dt.monthDayShort(atUtc(x.game_date))}, {x.year === y ? "" : `${seasonLabel(lg, x.year)} · `}{pending(x) ? <GameState text={say("scores.scheduled")} status={x.status} gameDate={x.game_date} /> : `${x.away} ${scoreOf(x)} ${x.home}`}</span>
    </Link>
  ) : <span className={`gnavlink off ${dir}`}><span className="gnavlab">{say(dir === "prev" ? "gm.prevMeeting" : "gm.nextMeeting")}</span><span className="gnavsub">{say("gm.noneMeeting")}</span></span>;

  return (
    <>
      <AccentStyle league={lg} />
      <SeriesStyle a={la} b={lb} />
      <section className="head fade">
        <span className="eyebrow">
          <Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}<Link href={seasonPath(lg, y)}>{say("gm.seasonLink", { season })}</Link>
          {playoffs && series ? <>{" · "}<Link href={roundPath(lg, y, roundNo)} prefetch={false}>{round}</Link></> : null}
        </span>
        <h1>{say("game.at", { away: A.name, home: H.name })}</h1>
        <p className="lede">
          {date}
          {venue?.name ? <>{" · "}{venue.wid ? <Link href={`/venue/${venue.wid}`} prefetch={false}>{venue.name}</Link> : venue.name}</> : null}
        </p>
      </section>

      <Showdown
        label={say("gm.aria", { away: A.name, home: H.name })} a={side(A)} b={side(H)} winner={winner} level={final && winner == null}
        score={[final ? A.score : "–", final ? H.score : "–"]}
        scoreLabel={final ? say("gs.aria", { away: A.name, awayScore: A.score!, home: H.name, homeScore: H.score!, status: state }) : state}
        verdict={<>{winner != null && sides[winner].logo ? <TeamLogo url={sides[winner].logo} size={36} shape="circle" /> : null}{verdict}</>}
        notes={[final ? state : null, competition, seriesState].filter((x): x is string => !!x)}
      />

      <nav className="gnav" aria-label={say("gm.navAria")}>
        {meetingLink(around_.prev, "prev")}
        <Link href={scoresPath(lg, g.game_date)} prefetch={false} className="gnavlink mid">
          <span className="gnavlab">{say("gm.dayGames")}</span>
          <span className="gnavsub">{dt.monthDayShort(atUtc(g.game_date))}</span>
        </Link>
        {meetingLink(around_.next, "next")}
      </nav>

      {final ? (
        <section className="section">
          <h2>{say("gs.headGame")}</h2>
          <GameSurface lg={lg} year={y} game={drawn} brands={brands} abbrs={abbrs} competition={competition} />
        </section>
      ) : null}

      <section className="section">
        <h2>{say("gm.factsHead")}</h2>
        <dl className="gfacts">
          <div><dt>{say("col.date")}</dt><dd><Link href={scoresPath(lg, g.game_date)} prefetch={false}>{date}</Link></dd></div>
          <div><dt>{say("gm.state")}</dt><dd>{stateLinked}</dd></div>
          <div><dt>{say("gm.competition")}</dt><dd>{playoffs && series ? <>{roundDated}{gameNo ? ` · ${gameNo}` : ""}{" · "}<Link href={seriesPath(paths, lg, y, series)} prefetch={false}>{say("gm.seeSeries")}</Link></> : competition}</dd></div>
          <div>
            <dt>{say("gm.venue")}</dt>
            <dd>{venue?.name ? (venue.wid ? <Link href={`/venue/${venue.wid}`} prefetch={false}>{venue.name}</Link> : venue.name) : neutral ? say("gm.neutral") : say("gm.venueUnknown")}</dd>
          </div>
          <div>
            <dt>{say("scores.leagueSite")}</dt>
            <dd><OfficialLinks league={lg} date={g.game_date} away={officialAbbr(abbrs, fa, y)} home={officialAbbr(abbrs, fh, y)} awayName={g.away} homeName={g.home} year={y} phase={g.phase} nhlId={g.nhl_id} nflWeek={g.nfl_week} retroBox={g.retro_box} status={g.status} startsAt={g.starts_at} box={say("scores.box")} notes={say("scores.notes")} day={say("scores.dayScores")} /></dd>
          </div>
          <div>
            <dt>{say("col.source")}</dt>
            <dd>
              <Badge src={g.source} />
              {g.checked === 1 ? <span className="ok" title={say("game.confirmedTitle")}>{"✓ " + say("game.confirmed")}</span> : null}
              {g.checked === -1 ? <span className="bad" title={say("game.disputedTitle")}>{"≠ " + say("game.disputed")}</span> : null}
            </dd>
          </div>
        </dl>
        <p className="note">{say("gm.noBox")}</p>
      </section>

      <section className="section">
        <h2>{say("gm.teamsHead")}</h2>
        <p className="note">{say("gm.teamsNote", { season })}</p>
        <div className="gteams">
          {sides.map((s) => {
            const fin = standing(s);
            return (
              <article key={s.i} className="gteam" style={{ "--tc": s.i === 0 ? "var(--ca)" : "var(--cb)" } as React.CSSProperties}>
                <h3><TeamLabel lg={lg} f={s.f} name={s.name} year={y} abbr={s.abbr} logo={s.logo} size={32} shape="square" /></h3>
                <dl>
                  {s.going ? (
                    <>
                      <div><dt>{say("gm.recordBefore")}</dt><dd>{s.going.number === 1 ? "–" : tally(s.going.before, otl)}</dd></div>
                      {final ? <div><dt>{say("gm.recordAfter")}</dt><dd>{tally(s.going.after, otl)} {s.result ? chip(s.result) : null}</dd></div> : null}
                    </>
                  ) : null}
                  {playoffs && s.going?.season ? <div><dt>{say("gm.regularSeasonHead")}</dt><dd>{tally(s.going.season, otl)}</dd></div> : null}
                  {fin ? <div><dt>{say("gm.finalRecord", { season })}</dt><dd>{fin}{s.st?.pts != null ? ` · ${say("gm.pts", { pts: fmt(s.st.pts) })}` : ""}</dd></div> : null}
                  {s.rank ? <div><dt>{say("gm.rankHead")}</dt><dd>{say("gm.rankOf", { place: fmt(s.rank.place), total: fmt(s.rank.of) })}{s.st?.division ? ` · ${s.st.division}` : s.st?.conference ? ` · ${s.st.conference}` : ""}</dd></div> : null}
                  {s.st?.pf != null && s.st.pa != null && s.st.gp ? <div><dt>{say("gm.perGame")}</dt><dd>{say("gm.forAgainst", { f: (s.st.pf / s.st.gp).toFixed(2), a: (s.st.pa / s.st.gp).toFixed(2) })}</dd></div> : null}
                  {s.form.length ? (
                    <div>
                      <dt>{say("gm.form", { n: fmt(s.form.length) })}</dt>
                      <dd className="gform">
                        {s.form.map((x) => <Link key={x.game.game_id} href={linkTo(x.game)} prefetch={false} className={`gchip ${x.result}`} title={`${dt.monthDayShort(atUtc(x.game.game_date))}: ${x.game.away} ${scoreOf(x.game)} ${x.game.home}`}>{say(RESULT_KEY[x.result])}</Link>)}
                      </dd>
                    </div>
                  ) : null}
                  {s.figures.map((f) => <div key={f.phrase}><dt>{say(f.phrase)}</dt><dd>{say("gm.rankOf", { place: fmt(f.place), total: fmt(f.of) })}</dd></div>)}
                </dl>
                <Suspense fallback={null}><GameLeaders lg={lg} teamSeasonId={s.tid} /></Suspense>
                <div className="gprevnext">
                  <div><span className="gl">{say("gm.prevGame")}</span>{s.prev ? gameLine(s.prev, s) : <span className="note">{say("gm.noGame")}</span>}</div>
                  <div><span className="gl">{say("gm.nextGame")}</span>{s.next ? gameLine(s.next, s) : <span className="note">{say("gm.noGame")}</span>}</div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {pair && head ? (
        <section className="section">
          <h2>{say("gm.h2hHead")}</h2>
          <p className="note">{say("gm.h2hAllTime", { a: A.name, b: H.name })}</p>
          {head.gp ? (
            <p className="gh2h">
              <b style={{ color: "var(--ca)" }}>{nickname(A.name)}</b> {fmt(head.a)}–{fmt(head.b)}{head.t ? `–${fmt(head.t)}` : ""} <b style={{ color: "var(--cb)" }}>{nickname(H.name)}</b>
              {" · "}{say("gm.h2hGames", { count: fmt(head.gp), af: fmt(head.af), bf: fmt(head.bf), unit: say(lg === "nhl" ? "gm.unitNhl" : lg === "mlb" ? "gm.unitMlb" : "gm.unitOther") })}
            </p>
          ) : <p className="note">{say("gm.h2hNone")}</p>}
          {thisSeason.length > 1 ? (
            <>
              <h3>{say("gm.h2hSeason", { season })}</h3>
              <ul className="gmeets">
                {thisSeason.map((x) => (
                  <li key={x.game_id} className={x.game_id === g.game_id ? "now" : undefined}>
                    {x.game_id === g.game_id ? <span className="note">{dt.monthDayShort(atUtc(x.game_date))}</span> : <Link href={linkTo(x)} prefetch={false}>{dt.monthDayShort(atUtc(x.game_date))}</Link>}
                    <span>{clubIn(x, true)} {isFinal(x) ? <>{scoreOf(x)} {clubIn(x, false)}</> : <Rich text={say("gm.at")} parts={{ team: clubIn(x, false) }} />}{x.overtime && isFinal(x) ? ` (${extra})` : ""}</span>
                    {x.phase === "playoffs" ? <span className="badge tag">{say("phase.playoffs")}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {recent.length ? (
            <>
              <h3>{say("gm.h2hRecent")}</h3>
              <ul className="gmeets">
                {recent.map((x) => (
                  <li key={x.game_id}>
                    <Link href={linkTo(x)} prefetch={false}>{dt.ymd(atUtc(x.game_date))}</Link>
                    <span>{clubIn(x, true)} {scoreOf(x)} {clubIn(x, false)}{x.overtime ? ` (${extra})` : ""}</span>
                    {x.phase === "playoffs" ? <span className="badge tag">{say("phase.playoffs")}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {h2h ? <p className="note"><Link href={h2h.path} prefetch={false}>{say("gm.h2hLink", { a: A.name, b: H.name })}</Link></p> : null}
        </section>
      ) : null}

      {sides.some((s) => s.franchise) ? (
        <section className="section">
          <h2>{say("gm.franchiseHead")}</h2>
          <div className="gteams">
            {sides.map((s) => s.franchise ? (
              <article key={s.i} className="gteam" style={{ "--tc": s.i === 0 ? "var(--ca)" : "var(--cb)" } as React.CSSProperties}>
                <h3><TeamLabel lg={lg} f={s.f} name={s.franchise.name} logo={s.logo} size={32} shape="square" /></h3>
                <p>
                  {say("gm.franchiseLine", { first: String(s.franchise.first_season ?? "–"), seasons: fmt(s.franchise.seasons), titles: fmt(s.franchise.titles) })}
                  {s.franchise.former_names.length ? ` ${say("gm.formerly", { names: s.franchise.former_names.join(", ") })}` : ""}
                </p>
                <p className="note"><Link href={paths.team(lg, s.franchise.franchise_id)} prefetch={false}>{say("gm.teamAll")}</Link></p>
              </article>
            ) : null)}
          </div>
        </section>
      ) : null}

      <section className="section">
        <p className="note">
          <Link href={seasonPath(lg, y)}>{say("gm.seasonLink", { season })}</Link>
          {" · "}<Link href={scoresPath(lg, g.game_date)} prefetch={false}>{say("gm.dayGames")}: {dt.monthDayShort(atUtc(g.game_date))}</Link>
          {" · "}<Link href={`${seasonPath(lg, y)}/leaders`} prefetch={false}>{say("gm.leaders", { season })}</Link>
        </p>
      </section>
    </>
  );
});
