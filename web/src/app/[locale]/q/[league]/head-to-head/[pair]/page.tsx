import LoadNote from "@/components/LoadNote";
import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { H2hChart, type H2hPoint } from "@/components/H2hChart";
import { H2hCompareRow, type H2hMetric } from "@/components/H2hCompare";
import { H2hPicker } from "@/components/H2hPicker";
import { H2hSeasonSelect } from "@/components/H2hSeasonSelect";
import { SeriesStyle } from "@/components/SeriesStyle";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { TeamLogo } from "@/components/TeamLogo";
import { queryHref } from "@/components/ViewTabs";
import { Badge, Figures } from "@/components/ui";
import "@/components/h2h.css";
import "@/components/series.css";
import "@/components/game.css";
import { abbrFor } from "@/lib/abbr";
import { brandFor, logoFor } from "@/lib/brand";
import { getAbbrs, getBrands, getTeam } from "@/lib/data";
import { fmt3, atUtc } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import {
  biggestWin, bySeason, h2hGames, parseH2hQuery, playoffMeetings, runByGame, runBySeason, streak, tally,
  type H2hGame, type PlayoffMeeting, type Season,
} from "@/lib/h2h";
import { getPairHistory } from "@/lib/h2hData";
import { groupPath, GROUP_IDS } from "@/lib/h2hGroup";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { RESULT_KEY } from "@/lib/i18n/keys";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel, seasonSeg } from "@/lib/leagues";
import { share } from "@/lib/loc";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { matchesResult, RESULTS, resultOptions } from "@/lib/resultFilter";
import { nickname, scoreText, seriesPath } from "@/lib/series";
import { seriesLooks } from "@/lib/seriesLooks";
import { withQuery } from "@/lib/slug";
import { parseSort, tableOf } from "@/lib/sort";
import { getLeagueClubs, getPaths, groupOf, h2hOf } from "@/lib/teamSlugs";
import { GroupPage, groupMeta } from "./group";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/[league]/head-to-head/[pair] keeps this page and revalidates it every day. The data behind it keeps its one-day cache (lib/api/client.ts).

const UNIT = { nhl: "unit.goals", pwhl: "unit.goals", nba: "unit.points", wnba: "unit.points", mlb: "unit.runs", nfl: "unit.points", cfl: "unit.points", nwsl: "unit.goals", afl: "unit.points", aafc: "unit.points", nha: "unit.goals", pcha: "unit.goals", wchl: "unit.goals", wha: "unit.goals" } as const satisfies Record<string, PhraseKey>;
/** A long history is listed from the newest game; the rest is one click away (?list=all). */
const LIST_LIMIT = 200;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The pair's games and the clubs' names, brands and abbreviations: a handful of cached requests, however long the rivalry. */
async function load(lg: string, a: number, b: number) {
  const [history, brands, ta, tb, abbrs] = await Promise.all([getPairHistory(lg, a, b), getBrands(), getTeam(lg, a), getTeam(lg, b), getAbbrs(lg)]);
  return { history, brands, abbrs, names: [ta?.names.at(-1)?.name ?? null, tb?.names.at(-1)?.name ?? null] as const };
}

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/q/[league]/head-to-head/[pair]">): Promise<Metadata> => {
  const { league, pair } = await params;
  if (!isLeague(league)) return {};
  const grp = await groupOf(league, pair);
  if (grp) return groupMeta(league, grp.f, grp.group, grp.path);
  const at = await h2hOf(league, pair);
  if (!at) return {};
  const [{ say, plural, locale }, d] = await Promise.all([currentSpeaker(), load(league, at.a, at.b).catch(() => null)]);
  if (!d) return {};
  const games = h2hGames(league, d.history, at.a, at.b);
  const na = d.names[0] ?? say("team.fallback", { id: at.a }), nb = d.names[1] ?? say("team.fallback", { id: at.b });
  const title = say("h2h.metaTitle", { a: na, b: nb, league: LG[league] });
  if (!games.length) return { ...pageMeta({ title, description: say("h2h.metaNever", { a: na, b: nb }), path: at.path, locale }), robots: { index: false, follow: false } };
  const t = tally(games, league);
  return pageMeta({
    title,
    description: say("h2h.metaDesc", {
      a: na, b: nb, games: plural("count.games", t.gp), x: t.a.w, y: t.b.w, first: seasonLabel(league, games[0].year), last: seasonLabel(league, games[games.length - 1].year),
    }),
    path: at.path,
    locale,
  });
});

export default guard(async function HeadToHeadPage({ params, searchParams }: PageProps<"/[locale]/q/[league]/head-to-head/[pair]">) {
  const { league: lg, pair } = await params;
  if (!isLeague(lg)) notFound();
  const grp = await groupOf(lg, pair);
  if (grp) {
    const gsp = await searchParams;
    if (grp.path !== `/${lg}/head-to-head/${pair}`) permanentRedirect(withQuery(grp.path, gsp));
    return <GroupPage lg={lg} f={grp.f} group={grp.group} path={grp.path} sp={gsp} />;
  }
  const at = await h2hOf(lg, pair);
  if (!at) notFound();
  const sp = await searchParams;
  const q = parseH2hQuery(sp, lg);
  // One address per pair (alphabetical) and one spelling of a season.
  if (at.path !== `/${lg}/head-to-head/${pair}` || !q.canonicalSeason) {
    permanentRedirect(withQuery(at.path, q.year != null && !q.canonicalSeason ? { ...sp, season: seasonSeg(lg, q.year) } : sp));
  }
  const { a, b } = at;
  const { say, plural, fmt, dt } = await currentSpeaker();
  const path = at.path;
  const eyebrow = <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}{say("h2h.eyebrow")}</span>;

  let d: Awaited<ReturnType<typeof load>>, paths: Awaited<ReturnType<typeof getPaths>>, clubs: Awaited<ReturnType<typeof getLeagueClubs>>;
  try {
    [d, paths, clubs] = await Promise.all([load(lg, a, b), getPaths(), getLeagueClubs(lg)]);
  } catch {
    return <><AccentStyle league={lg} /><section className="head fade">{eyebrow}<h1>{say("h2h.eyebrow")}</h1></section><LoadNote /></>;
  }

  const all = h2hGames(lg, d.history, a, b);
  const seasonsAll = bySeason(all, lg);
  const hasPlayoffs = all.some((g) => g.ph === "playoffs"), hasRegular = all.some((g) => g.ph === "regular");
  const year = q.year != null && seasonsAll.some((s) => s.year === q.year) ? q.year : null;
  const phase = hasPlayoffs && hasRegular ? q.phase : "all";
  const inPhase = all.filter((g) => phase === "all" || g.ph === phase);
  const inLoc = inPhase.filter((g) => q.loc === "all" || (q.loc === "home" ? g.aHome : !g.aHome));
  const picked = year != null ? inLoc.filter((g) => g.year === year) : inLoc;
  // ?result= narrows the games list only; a result the pair never had (a tie in the NBA) is the same as all.
  const resultChoices = resultOptions(all);
  const result = resultChoices.includes(q.result) ? q.result : "all";
  const inResult = picked.filter((g) => matchesResult(g, result));

  // The names the clubs wear now, or wore in the season chosen.
  const seasonNames = (y: number | null) => {
    const s = (y != null ? seasonsAll.find((x) => x.year === y) : null) ?? seasonsAll.at(-1);
    return s ? [s.aName, s.bName] as const : [null, null] as const;
  };
  const shown = year != null ? seasonNames(year) : [null, null] as const;
  const fallback = (i: 0 | 1) => say("team.fallback", { id: i === 0 ? a : b });
  const name = [shown[0] ?? d.names[0] ?? seasonNames(null)[0] ?? fallback(0), shown[1] ?? d.names[1] ?? seasonNames(null)[1] ?? fallback(1)] as const;
  const [na, nb] = [nickname(name[0]), nickname(name[1])];
  const logoYear = year ?? undefined;
  const [la, lb] = seriesLooks(lg, brandFor(d.brands, a, logoYear), brandFor(d.brands, b, logoYear));
  const unit = say(UNIT[lg]);
  const hrefTo = (changes: Record<string, string | null>) => queryHref(path, sp, changes);

  const head = (
    <section className="head fade">
      {eyebrow}
      <h1>{say("h2h.title", { a: name[0], b: name[1] })}</h1>
      <H2hPicker
        lg={lg} a={a} b={b} names={name} logos={[logoFor(d.brands, a, logoYear), logoFor(d.brands, b, logoYear)]}
        clubs={clubs.map((c) => ({ ...c, alt: c.alt.slice(0, 6), logo: logoFor(d.brands, c.f) }))}
      />
      <p className="note">
        {say("h2h.group.links")}:{" "}
        {([[a, na], [b, nb]] as const).map(([f, n]) => GROUP_IDS.map((g) => <span key={`${f}${g}`}><Link href={groupPath(paths, lg, f, g)} prefetch={false}>{n} · {say(`h2h.group.${g}` as PhraseKey)}</Link>{" "}</span>))}
      </p>
    </section>
  );
  const sides = (
    <p className="note">
      <TeamLabel lg={lg} f={a} name={name[0]} logo={logoFor(d.brands, a, logoYear)} />{" · "}<TeamLabel lg={lg} f={b} name={name[1]} logo={logoFor(d.brands, b, logoYear)} />
    </p>
  );

  if (!all.length) {
    return (
      <>
        <AccentStyle league={lg} />
        {head}
        <div className="h2hnever">
          <b>{say("h2h.never", { a: name[0], b: name[1] })}</b>
          <p className="note">{say("h2h.neverNote")}</p>
          {sides}
        </div>
      </>
    );
  }

  const seasonOptions = [...seasonsAll].reverse().map((s) => ({ label: seasonLabel(lg, s.year) }));
  const first = all[0], last = all[all.length - 1];
  const t = tally(picked, lg);

  // The page-level choices (season, part of season, venue) as a row; with an anchor it is the games list's own copy of them.
  const choices = (hash: string, withResult: boolean) => (
    <div className="h2hcontrols">
      <label>{say("col.season")}<H2hSeasonSelect seasons={seasonOptions} value={year != null ? seasonLabel(lg, year) : ""} anchor={hash} /></label>
      {hasPlayoffs && hasRegular ? (
        <nav className="seg views" aria-label={say("phase.aria")}>
          {([["all", "phase.all"], ["regular", "phase.regular"], ["playoffs", "phase.playoffs"]] as const).map(([k, label]) => (
            <Link key={k} href={`${hrefTo({ phase: k === "all" ? null : k, list: null })}${hash}`} prefetch={false} scroll={false} aria-current={k === phase ? "page" : undefined}>{say(label)}</Link>
          ))}
        </nav>
      ) : null}
      <nav className="seg views" aria-label={say("loc.aria")}>
        {([["all", say("loc.all")], ["home", say("h2h.locHome", { team: na })], ["road", say("h2h.locRoad", { team: na })]] as const).map(([k, label]) => (
          <Link key={k} href={`${hrefTo({ loc: k === "all" ? null : k, list: null })}${hash}`} prefetch={false} scroll={false} aria-current={k === q.loc ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {withResult ? (
        <div className="lbl">
          <span>{say("h2h.result.aria", { team: na })}</span>
          <nav className="seg views" aria-label={say("h2h.result.aria", { team: na })}>
            {RESULTS.filter(([k]) => resultChoices.includes(k)).map(([k, , label]) => (
              <Link key={k} href={`${hrefTo({ result: k === "all" ? null : k, list: null })}${hash}`} prefetch={false} scroll={false} aria-current={k === result ? "page" : undefined}>{say(label)}</Link>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
  const controls = choices("", false);

  const lede = (
    <p className="lede">
      {year != null
        ? say("h2h.ledeSeason", { games: plural("count.games", t.gp), season: seasonLabel(lg, year) })
        : say("h2h.ledeAll", { games: plural("count.games", t.gp), first: seasonLabel(lg, first.year), last: seasonLabel(lg, last.year) })}
      {" "}
      {year != null ? <Link href={hrefTo({ season: null, list: null })} scroll={false}>{say("h2h.seeAll")}</Link> : null}
    </p>
  );

  if (!picked.length || (q.year != null && year == null)) {
    return (
      <>
        <AccentStyle league={lg} />
        {head}
        {controls}
        <p className="note">{q.year != null && year == null ? say("h2h.noSeason", { a: name[0], b: name[1], season: seasonLabel(lg, q.year) }) : say("h2h.noMatch")}</p>
        <p><Link href={path}>{say("h2h.reset")}</Link></p>
      </>
    );
  }

  const lead = t.a.w - t.b.w;
  const verdict = lead === 0 ? say("h2h.level") : say("h2h.leads", { team: lead > 0 ? na : nb });
  const ties = t.a.t;
  const note = ties ? say("h2h.noteTies", { games: plural("count.games", t.gp), ties: fmt(ties) }) : plural("count.games", t.gp);
  const shareA = share(t.a), shareB = share(t.b);
  const recA = recordText(t.a), recB = recordText(t.b);

  const seasonHref = (y: number) => `${hrefTo({ season: seasonSeg(lg, y), list: null })}#games`;
  const side = (i: 0 | 1) => {
    const f = i === 0 ? a : b, r = i === 0 ? t.a : t.b, sh = i === 0 ? shareA : shareB, scored = i === 0 ? t.af : t.bf;
    const logo = logoFor(d.brands, f, logoYear);
    return (
      <div className={`hs ${i === 0 ? "a" : "b"}`}>
        <h2 className="hsname">
          {logo ? null : <span className="hscrest"><span className="mono">{abbrFor(d.abbrs, f, year ?? last.year, name[i])}</span></span>}
          <TeamLabel lg={lg} f={f} name={name[i]} logo={logo} size={64} shape="circle" />
        </h2>
        <span className="hsstats">
          <span>{say("h2h.side.record", { record: recordText(r) })}</span>
          {sh == null ? null : <span>{say("h2h.side.share", { share: fmt3(sh) })}</span>}
          <span>{say("h2h.side.scored", { count: fmt(scored), unit: unit.toLowerCase() })}</span>
        </span>
        <span className="hslinks">
          {year != null ? <Link href={paths.teamSeason(lg, f, year)} prefetch={false}>{say("team.everyGame", { season: seasonLabel(lg, year) })}</Link> : null}
          <Link href={paths.team(lg, f)} prefetch={false}>{say("tseason.allSeasons")}</Link>
        </span>
      </div>
    );
  };

  // A game opens its day on the team's season page (that page is for side a).
  const dayHref = (g: H2hGame) => `${paths.teamSeason(lg, a, g.year)}?month=${g.date.slice(0, 7)}&day=${g.date}${g.ph === "playoffs" ? "&phase=p" : ""}`;
  const gameLink = (g: H2hGame, text: string) => (
    <Link href={dayHref(g)} prefetch={false} title={say("h2h.gameTitle")}>{text}</Link>
  );
  const fact = (key: PhraseKey, g: H2hGame | null, who: 0 | 1 | null) => {
    if (!g) return null;
    const win = who ?? (g.res === "T" ? null : g.res === "W" ? 0 : 1);
    const hi = Math.max(g.a, g.b), lo = Math.min(g.a, g.b);
    const tc = win == null ? "var(--rule)" : win === 0 ? "var(--ca)" : "var(--cb)";
    return (
      <Link className="h2hfact" href={dayHref(g)} prefetch={false} style={{ "--tc": tc } as React.CSSProperties} title={say("h2h.gameTitle")}>
        <span className="k">{say(key)}</span>
        <b>{win == null ? say("h2h.tie") : <><TeamLogo url={logoFor(d.brands, win === 0 ? a : b, g.year)} />{win === 0 ? na : nb}</>} {hi}–{lo}</b>
        <span className="sub">{dt.ymd(atUtc(g.date))}{g.ph === "playoffs" ? ` · ${say("phase.playoffs")}` : ""}{g.ot ? ` · ${say(lg === "mlb" ? "col.extras" : "col.ot")}` : ""}</span>
      </Link>
    );
  };
  const st = streak(picked);
  const streakCard = st ? (
    <div className="h2hfact" style={{ "--tc": st.side == null ? "var(--rule)" : st.side === 0 ? "var(--ca)" : "var(--cb)" } as React.CSSProperties}>
      <span className="k">{say("h2h.fact.streak")}</span>
      <b>{st.side == null ? say("h2h.tie") : <TeamLabel lg={lg} f={st.side === 0 ? a : b} name={st.side === 0 ? na : nb} logo={logoFor(d.brands, st.side === 0 ? a : b, logoYear)} />}</b>
      <span className="sub">{st.side == null ? say("h2h.streak.tie") : plural("h2h.streak", st.n)}</span>
    </div>
  ) : null;
  const winA = biggestWin(picked, 0), winB = biggestWin(picked, 1);
  const facts = (
    <div className="h2hfacts">
      {streakCard}
      {fact("h2h.fact.last", picked.at(-1) ?? null, null)}
      {fact("h2h.fact.biggest", winA, 0)}
      {fact("h2h.fact.biggest", winB, 1)}
    </div>
  );

  const gp = (r: { w: number; l: number; t: number; otl: number }) => r.w + r.l + r.t + r.otl;
  const homeA = tally(picked.filter((g) => g.aHome), lg), homeB = tally(picked.filter((g) => !g.aHome), lg);
  const per = (v: number) => (t.gp ? v / t.gp : null);
  const metrics: H2hMetric[] = [
    { label: say("fig.wins"), a: t.a.w, b: t.b.w, text: (v) => fmt(v) },
    { label: say("fig.share"), a: shareA, b: shareB, text: fmt3, ta: recA, tb: recB },
    { label: say("h2h.cmp.for", { unit: unit.toLowerCase() }), a: t.af, b: t.bf, text: (v) => fmt(v) },
    { label: say("h2h.cmp.perGame", { unit: unit.toLowerCase() }), a: per(t.af), b: per(t.bf), text: (v) => v.toFixed(2) },
  ];
  if (gp(homeA.a) && gp(homeB.b)) metrics.push({ label: say("h2h.cmp.home"), a: share(homeA.a), b: share(homeB.b), text: fmt3, ta: recordText(homeA.a), tb: recordText(homeB.b) });

  // The running lead: by season over the years, game by game inside one season.
  const lineName = (i: 0 | 1) => (i === 0 ? na : nb);
  const leadLine = (diff: number) => (diff === 0 ? say("h2h.tip.level") : say("h2h.tip.lead", { team: lineName(diff > 0 ? 0 : 1), n: fmt(Math.abs(diff)) }));
  const points: H2hPoint[] = year != null
    ? runByGame(picked).map((p) => ({
      x: p.n, y: p.diff,
      title: say("h2h.tip.game", { n: fmt(p.n), date: dt.monthDayShort(atUtc(p.g.date)) }),
      lines: [say("h2h.tip.score", { a: na, as: p.g.a, b: nb, bs: p.g.b }) + (p.g.ot ? ` ${say(lg === "mlb" ? "col.extras" : "col.ot")}` : ""), leadLine(p.diff)],
    }))
    : runBySeason(bySeason(inLoc, lg)).map((p) => ({
      x: p.year, y: p.diff,
      title: seasonLabel(lg, p.year),
      lines: [say(p.t ? "h2h.tip.seasonTies" : "h2h.tip.season", { a: na, aw: p.aw, b: nb, bw: p.bw, t: p.t }), leadLine(p.diff)],
    }));

  // The by-season table: every season of the pair under the part of the season and venue chosen.
  const rows: Season[] = bySeason(inLoc, lg);
  const cumulative = new Map<number, number>();
  let run = 0;
  for (const s of rows) { run += s.t.a.w - s.t.b.w; cumulative.set(s.year, run); }
  const renamed = rows.some((s) => s.aName !== (d.names[0] ?? s.aName) || s.bName !== (d.names[1] ?? s.bName));
  const signed = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
  const seasonTable = tableOf(rows, [
    { key: "season", label: say("col.season"), cls: "seasoncell", get: (s: Season) => s.year, cell: (s: Season) => <Link href={seasonHref(s.year)} prefetch={false} scroll={false}>{seasonLabel(lg, s.year)}</Link> },
    ...(renamed ? [{ key: "teams", label: say("h2h.col.teams"), cls: "team", get: (s: Season) => `${s.aName} ${s.bName}`, cell: (s: Season) => (
      <span className="h2hpair">
        <span><TeamLabel lg={lg} f={a} name={s.aName} year={s.year} logo={logoFor(d.brands, a, s.year)} /></span>
        <span className="vs" aria-hidden="true">·</span>
        <span><TeamLabel lg={lg} f={b} name={s.bName} year={s.year} logo={logoFor(d.brands, b, s.year)} /></span>
      </span>
    ) }] : []),
    { key: "gp", label: say("col.gp"), num: true, get: (s: Season) => s.t.gp, cell: (s: Season) => fmt(s.t.gp) },
    { key: "rec", label: say("h2h.col.record", { team: na }), num: true, title: say("h2h.col.recordTitle"), get: (s: Season) => share(s.t.a), cell: (s: Season) => recordText(s.t.a) },
    { key: "share", label: say("col.share"), num: true, title: say("h2h.col.shareTitle", { team: na }), get: (s: Season) => share(s.t.a), cell: (s: Season) => { const v = share(s.t.a); return v == null ? "" : fmt3(v); } },
    { key: "af", label: `${na} ${unit}`, num: true, get: (s: Season) => s.t.af, cell: (s: Season) => fmt(s.t.af) },
    { key: "bf", label: `${nb} ${unit}`, num: true, get: (s: Season) => s.t.bf, cell: (s: Season) => fmt(s.t.bf) },
    { key: "lead", label: say("h2h.col.lead"), num: true, title: say("h2h.col.leadTitle", { team: na }), get: (s: Season) => cumulative.get(s.year), cell: (s: Season) => { const v = cumulative.get(s.year)!; return <span className={v > 0 ? "up" : v < 0 ? "down" : undefined}>{signed(v)}</span>; } },
  ], (s) => s.year, (s) => (s.year === year ? "selrow" : undefined));

  // Playoff series between the two, from the same games (no more requests); a series opens its own page.
  const meetings: PlayoffMeeting[] = phase === "regular" ? [] : playoffMeetings(lg, d.history, a, b).filter((m) => year == null || m.year === year);
  const seriesTable = tableOf(meetings, [
    { key: "season", label: say("col.season"), cls: "seasoncell", get: (m: PlayoffMeeting) => m.year, cell: (m: PlayoffMeeting) => <Link href={seriesPath(paths, lg, m.year, m.s)} prefetch={false}>{seasonLabel(lg, m.year)}</Link> },
    { key: "winner", label: say("past.winner"), cls: "team", get: (m: PlayoffMeeting) => (m.s.winner == null ? "" : m.s.sides[0].name), cell: (m: PlayoffMeeting) => (m.s.winner == null ? (m.s.live ? say("past.inProgress") : "–") : <span className="won"><TeamLabel lg={lg} f={m.s.sides[0].f} name={m.s.sides[0].name} year={m.year} logo={logoFor(d.brands, m.s.sides[0].f, m.year)} /></span>) },
    { key: "result", label: say("past.result"), num: true, get: (m: PlayoffMeeting) => m.s.sides[0].wins - m.s.sides[1].wins, cell: (m: PlayoffMeeting) => <Link href={seriesPath(paths, lg, m.year, m.s)} prefetch={false}>{scoreText(m.s)}</Link> },
    { key: "games", label: say("col.gp"), num: true, get: (m: PlayoffMeeting) => m.s.games.filter((g) => g.played).length },
  ], (m) => `${m.year}-${m.s.meeting}`);
  const aSeries = meetings.filter((m) => m.s.winner != null && m.s.sides[0].f === a).length, bSeries = meetings.filter((m) => m.s.winner != null && m.s.sides[0].f === b).length;

  // The games, newest first; a long history shows the latest ones and offers the rest.
  const ordered = [...inResult].reverse();
  const cut = year == null && !q.list && ordered.length > LIST_LIMIT;
  const listed = cut ? ordered.slice(0, LIST_LIMIT) : ordered;
  const extra = say(lg === "mlb" ? "col.extras" : "col.ot");
  const gameTable = tableOf(listed, [
    { key: "season", label: say("col.season"), cls: "seasoncell", get: (g: H2hGame) => g.year, cell: (g: H2hGame) => <Link href={paths.teamSeason(lg, a, g.year)} prefetch={false} title={say("h2h.seasonTitle", { team: name[0], season: seasonLabel(lg, g.year) })}>{seasonLabel(lg, g.year)}</Link> },
    {
      key: "date", label: say("col.date"), cls: "seasoncell", get: (g: H2hGame) => g.date,
      cell: (g: H2hGame) => <>{gameLink(g, year == null ? dt.ymd(atUtc(g.date)) : dt.dayName(atUtc(g.date)))}{g.ph === "playoffs" ? <span className="badge tag">{say("phase.playoffs")}</span> : null}</>,
    },
    {
      key: "away", label: say("h2h.col.away"), cls: "team", get: (g: H2hGame) => g.awayName,
      cell: (g: H2hGame) => <span className={g.awayScore > g.homeScore ? "won" : undefined}><TeamLabel lg={lg} f={g.aHome ? b : a} name={g.awayName} year={g.year} logo={logoFor(d.brands, g.aHome ? b : a, g.year)} /></span>,
    },
    {
      key: "score", label: say("col.score"), num: true, title: say("h2h.col.scoreTitle"), cls: "h2hscore", get: (g: H2hGame) => g.awayScore - g.homeScore,
      cell: (g: H2hGame) => <><Link className="scorelink" href={gamePath(lg, g.year, g.id, g.awayName, g.homeName)} prefetch={false} title={say("gm.viewGameTitle", { away: g.awayName, home: g.homeName })}>{g.awayScore}–{g.homeScore}</Link>{g.ot ? <span className="badge tag ot">{extra}</span> : null}</>,
    },
    {
      key: "home", label: say("h2h.col.home"), cls: "team", get: (g: H2hGame) => g.homeName,
      cell: (g: H2hGame) => <span className={g.homeScore > g.awayScore ? "won" : undefined}><TeamLabel lg={lg} f={g.aHome ? a : b} name={g.homeName} year={g.year} logo={logoFor(d.brands, g.aHome ? a : b, g.year)} /></span>,
    },
    { key: "res", label: say("h2h.col.result", { team: na }), get: (g: H2hGame) => g.res, cell: (g: H2hGame) => <span className={g.res === "W" ? "ok" : g.res === "T" ? undefined : "bad"}>{say(RESULT_KEY[g.res])}</span> },
    { key: "src", label: say("col.source"), get: (g: H2hGame) => g.src, cell: (g: H2hGame) => <Badge src={g.src} /> },
  ], (g) => g.id);

  const figs: [string, number | string][] = [
    [say("fig.games"), t.gp],
    [say("fig.seasons"), new Set(picked.map((g) => g.year)).size],
    [unit, `${fmt(t.af)} – ${fmt(t.bf)}`],
  ];
  if (hasPlayoffs && phase !== "regular") figs.push([say("h2h.fig.series"), meetings.length]);
  if (year == null) figs.push([say("h2h.fig.first"), seasonLabel(lg, picked[0].year)]);

  const sortSeasons = parseSort(one(sp.sort_seasons), seasonTable.columns.map((c) => c.key), "season.desc");
  const sortSeries = parseSort(one(sp.sort_series), seriesTable.columns.map((c) => c.key), "season.desc");
  const sortGames = parseSort(one(sp.sort_games), gameTable.columns.map((c) => c.key), "date.desc");

  return (
    <>
      <AccentStyle league={lg} />
      <SeriesStyle a={la} b={lb} />
      {head}
      {lede}
      {controls}

      <section className="h2hsum" aria-label={say("h2h.title", { a: name[0], b: name[1] })}>
        {side(0)}
        <div className="hsmid">
          <div className="hsscore" aria-label={`${t.a.w}–${t.b.w}`}>
            <b className={`n a${lead > 0 ? " w" : ""}`}>{t.a.w}</b>
            <span className="dash" aria-hidden="true">–</span>
            <b className={`n b${lead < 0 ? " w" : ""}`}>{t.b.w}</b>
          </div>
          <span className="hsverdict">{verdict}</span>
          <span className="hsnote">{note}</span>
        </div>
        {side(1)}
      </section>

      <Figures items={figs} />
      <section className="section">
        <h2>{say("h2h.facts")}</h2>
        {facts}
      </section>

      <section className="section">
        <h2>{say("h2h.cmp.title")}</h2>
        <p className="note">{say("h2h.cmp.note")}</p>
        <div className="cmp">
          <div className="cmphead"><b style={{ color: "var(--ca)" }}><TeamLabel lg={lg} f={a} name={na} logo={logoFor(d.brands, a, logoYear)} /></b><span /><b style={{ color: "var(--cb)" }}><TeamLabel lg={lg} f={b} name={nb} logo={logoFor(d.brands, b, logoYear)} /></b></div>
          {metrics.map((m) => <H2hCompareRow key={m.label} m={m} />)}
        </div>
      </section>

      <section className="section">
        <h2>{say("h2h.chart.title")}</h2>
        <p className="note">{say(year != null ? "h2h.chart.noteGame" : "h2h.chart.noteSeason")}</p>
        <H2hChart points={points} byGame={year != null} legend={[say("h2h.chart.ahead", { team: na }), say("h2h.chart.ahead", { team: nb })]} aria={say("h2h.chart.aria", { a: na, b: nb })} none={say("chart.noResults")} />
      </section>

      {year == null || rows.length ? (
        <section className="section">
          <h2>{say("h2h.seasons.title")}</h2>
          <p className="note">{say("h2h.seasons.note", { team: na })}</p>
          <div className="tablebox"><SortTable {...seasonTable} param="sort_seasons" def="season.desc" initial={sortSeasons} label={say("h2h.seasons.title")} /></div>
        </section>
      ) : null}

      {meetings.length ? (
        <section className="section">
          <h2>{say("h2h.series.title")}</h2>
          <p className="note">{say("h2h.series.note", { a: na, aw: fmt(aSeries), b: nb, bw: fmt(bSeries) })}</p>
          <div className="tablebox"><SortTable {...seriesTable} param="sort_series" def="season.desc" initial={sortSeries} label={say("h2h.series.title")} /></div>
        </section>
      ) : null}

      <section className="section" id="games">
        <h2>{say("h2h.games.title")}</h2>
        {choices("#games", true)}
        <p className="note">
          {cut ? say("h2h.games.latest", { shown: fmt(listed.length), games: plural("count.games", ordered.length) }) : result !== "all" ? say("h2h.games.of", { shown: fmt(ordered.length), games: plural("count.games", picked.length) }) : plural("count.games", ordered.length)}
          {" "}{say("h2h.games.note")}
          {cut ? <>{" "}<Link href={`${hrefTo({ list: "all" })}#games`} prefetch={false} scroll={false}>{say("h2h.games.all", { count: fmt(ordered.length) })}</Link></> : null}
        </p>
        {ordered.length ? (
          <div className="tablebox"><SortTable {...gameTable} param="sort_games" def="date.desc" initial={sortGames} label={say("h2h.games.title")} /></div>
        ) : <p className="note">{say("h2h.noMatch")} <Link href={`${hrefTo({ result: null, list: null })}#games`} prefetch={false} scroll={false}>{say("h2h.result.clear")}</Link></p>}
      </section>
    </>
  );
});
