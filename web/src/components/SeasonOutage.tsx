import Link from "next/link";
import type { ReactNode } from "react";
import { OutageSlope } from "@/components/OutageSlope";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLink } from "@/components/ui";
import type { SeasonOutageRow, SeasonSummaryRow } from "@/lib/api/types";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import { logoFor, type BrandMap } from "@/lib/brand";
import { getAbbrs, getBrands, getSeasonStandings } from "@/lib/data";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel } from "@/lib/leagues";
import {
  carryOver, coachMoves, crossing, figuresOf, franchiseChanges, lineUp, movers, rankClubs, usesPoints,
  type Carry, type Club, type Line, type Person,
} from "@/lib/outage";
import { getHeadCoaches, getIdentities, getOutage, getSeasonRoster, neighbours } from "@/lib/outageData";
import { getPlayerPaths } from "@/lib/playerLinks";
import { seasonPath } from "@/lib/slug";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { getPaths } from "@/lib/teamSlugs";
import "@/components/outage.css";

const rec = (c: Club | null): string => (c ? `${c.w ?? 0}-${c.l ?? 0}${c.t ? `-${c.t}` : ""}${c.otl ? `-${c.otl}` : ""}` : "");
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
const share = (n: number) => fmt3(Math.abs(n)).replace(/^0/, "");

/**
 * The page of a season the league did not play: why, then the season before set against the season after (clubs, standings, who
 * moved, who coached, who played). Everything past the article is an extra: it reads views that may not be on the database yet, and
 * leaves out whatever it cannot fill.
 */
export async function SeasonOutage({ lg, year, seasons }: { lg: string; year: number; seasons: SeasonSummaryRow[] }) {
  const { say } = await currentSpeaker();
  const { before, after } = neighbours(seasons, lg, year);
  const [outage, brands, abbrs, paths, player] = await Promise.all([getOutage(lg, year), getBrands(), getAbbrs(lg), getPaths(), getPlayerPaths()]);
  return (
    <>
      <Article outage={outage} />
      {before && after ? <BeforeAfter lg={lg} before={before} after={after} brands={brands} abbrs={abbrs} paths={paths} player={player} /> : null}
      {outage ? null : <p className="note">{say("outage.noArticle")}</p>}
    </>
  );
}

const KIND = { lockout: "outage.kind.lockout", strike: "outage.kind.strike", pandemic: "outage.kind.pandemic", war: "outage.kind.war", other: "outage.kind.other" } as const;

async function Article({ outage }: { outage: SeasonOutageRow | null }) {
  const { say, fmt, dt, locale } = await currentSpeaker();
  if (!outage) return null;
  const translated = locale === "fr" ? outage.note_fr : locale === "ja" ? outage.note_ja : null;
  const facts: [string, string][] = [];
  if (outage.stopped_on) facts.push([say("outage.stopped"), dt.ymd(atUtc(outage.stopped_on))]);
  if (outage.cancelled_on) facts.push([say("outage.cancelled"), dt.ymd(atUtc(outage.cancelled_on))]);
  if (outage.resumed_on) facts.push([say("outage.resumed"), dt.ymd(atUtc(outage.resumed_on))]);
  if (outage.games_cancelled) facts.push([say("outage.gamesLost"), fmt(outage.games_cancelled)]);
  const kind = KIND[outage.kind as keyof typeof KIND];
  return (
    <section className="section outage-article">
      <h2>{say("outage.what")}{kind ? <span className="defending">{say(kind)}</span> : null}</h2>
      <p className="outage-text" lang={translated || locale === "en" ? undefined : "en"}>{translated ?? outage.note_en}</p>
      {facts.length ? (
        <dl className="outfacts">
          {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : null}
      <p className="note">
        {say("outage.credit")}
        {outage.source_url ? <>{" "}<a href={outage.source_url} rel="noopener noreferrer">{say("sched.source")}</a></> : null}
      </p>
    </section>
  );
}

interface BAProps {
  lg: string;
  before: SeasonSummaryRow;
  after: SeasonSummaryRow;
  brands: BrandMap;
  abbrs: AbbrMap;
  paths: Awaited<ReturnType<typeof getPaths>>;
  player: Awaited<ReturnType<typeof getPlayerPaths>>;
}

async function BeforeAfter({ lg, before, after, brands, abbrs, paths, player }: BAProps) {
  const { say, plural, fmt } = await currentSpeaker();
  const [stB, stA, idB, idA, rosB, rosA, coB, coA] = await Promise.all([
    getSeasonStandings(lg, before.year), getSeasonStandings(lg, after.year),
    getIdentities(lg, before.year), getIdentities(lg, after.year),
    getSeasonRoster(lg, before.year), getSeasonRoster(lg, after.year),
    getHeadCoaches(lg, before.year), getHeadCoaches(lg, after.year),
  ]);
  const cb = rankClubs(stB), ca = rankClubs(stA);
  if (!cb.length && !ca.length) return null;
  const lines = lineUp(cb, ca);
  const metric = usesPoints([...stB, ...stA]) ? say("outage.metricPoints") : say("outage.metricWins");
  const nameOf = new Map<number, string>();
  for (const c of [...cb, ...ca]) nameOf.set(c.f, c.name);
  for (const c of cb) nameOf.set(c.f, nameOf.get(c.f) ?? c.name);
  for (const c of ca) nameOf.set(c.f, c.name);
  const labelB = seasonLabel(lg, before.year), labelA = seasonLabel(lg, after.year);
  const team = (f: number, y: number, text?: string) => (
    <span className="tm"><TeamLogo url={logoFor(brands, f, y)} /><TeamLink lg={lg} f={f} name={text ?? nameOf.get(f) ?? ""} /></span>
  );
  const pLink = (p: Person) => <Link key={p.id} href={player(p.id, p.name, lg)} prefetch={false}>{p.name}</Link>;
  const list = (ps: Person[], n: number): ReactNode => ps.slice(0, n).flatMap((p, i) => (i ? [", ", pLink(p)] : [pLink(p)]));
  const changes = franchiseChanges(cb, ca, idB, idA);
  const changeOf = new Map(changes.map((c) => [c.f, c]));
  const fig = { b: figuresOf(cb), a: figuresOf(ca) };
  const { risers, fallers } = movers(lines, 3);
  const coaches = coachMoves(lines.filter((l) => l.before && l.after).map((l) => l.f), coB, coA);
  const carry = carryOver(rosB, rosA);
  const cross = rosB.length && rosA.length ? crossing(rosB, rosA, before.year, after.year) : null;
  const changedCoaches = coaches.filter((c) => c.changed).length, known = coaches.filter((c) => c.changed != null).length;

  /* the clubs table */
  const kindLabel = (f: number) => {
    const c = changeOf.get(f);
    return c ? <span className="defending">{say(`outage.kind.${c.kind}` as const)}</span> : null;
  };
  const cols: ColumnSpec<Line>[] = [
    { key: "team", label: say("col.team"), cls: "team", get: (l) => nameOf.get(l.f) ?? "", cell: (l) => <>{team(l.f, (l.after ? after : before).year)}{kindLabel(l.f)}</> },
    { key: "rb", label: say("outage.colRank", { season: labelB }), num: true, get: (l) => l.before?.rank ?? null },
    { key: "recb", label: say("col.record"), title: labelB, get: (l) => l.before?.strength ?? null, cell: (l) => (l.before ? <Link href={paths.teamSeason(lg, l.f, before.year)} prefetch={false}>{rec(l.before)}</Link> : "") },
    ...(usesPoints(stB) ? [{ key: "ptsb", label: say("col.pts"), title: labelB, num: true, get: (l: Line) => l.before?.pts ?? null } as ColumnSpec<Line>] : []),
    { key: "ra", label: say("outage.colRank", { season: labelA }), num: true, get: (l) => l.after?.rank ?? null },
    { key: "reca", label: say("col.record"), title: labelA, get: (l) => l.after?.strength ?? null, cell: (l) => (l.after ? <Link href={paths.teamSeason(lg, l.f, after.year)} prefetch={false}>{rec(l.after)}</Link> : "") },
    ...(usesPoints(stA) ? [{ key: "ptsa", label: say("col.pts"), title: labelA, num: true, get: (l: Line) => l.after?.pts ?? null } as ColumnSpec<Line>] : []),
    { key: "places", label: say("outage.colPlaces"), num: true, title: say("outage.colPlacesTitle"), get: (l) => l.places, cell: (l) => (l.places == null ? "" : <span className={l.places > 0 ? "up" : l.places < 0 ? "down" : undefined}>{sign(l.places)}{Math.abs(l.places)}</span>) },
    { key: "chg", label: say("outage.colChange", { metric }), num: true, get: (l) => l.change, cell: (l) => (l.change == null ? "" : <span className={l.change > 0.005 ? "up" : l.change < -0.005 ? "down" : undefined}>{sign(l.change)}{share(l.change)}</span>) },
  ];
  const clubs = tableOf(lines, cols, (l) => l.f);

  /* coaches */
  const ccols: ColumnSpec<(typeof coaches)[number]>[] = [
    { key: "team", label: say("col.team"), cls: "team", get: (c) => nameOf.get(c.f) ?? "", cell: (c) => team(c.f, after.year) },
    { key: "cb", label: say("outage.coachIn", { season: labelB }), get: (c) => c.before?.name ?? null },
    { key: "ca", label: say("outage.coachIn", { season: labelA }), get: (c) => c.after?.name ?? null },
    { key: "st", label: say("outage.coachStatus"), get: (c) => (c.changed == null ? null : c.changed ? 1 : 0), cell: (c) => (c.changed == null ? "" : c.changed ? <span className="defending">{say("outage.coachNew")}</span> : say("outage.coachSame")) },
  ];
  const coachTable = tableOf(coaches.filter((c) => c.before || c.after), ccols, (c) => c.f);

  /* rosters */
  const rcols: ColumnSpec<Carry>[] = [
    { key: "team", label: say("col.team"), cls: "team", get: (c) => nameOf.get(c.f) ?? "", cell: (c) => team(c.f, after.year) },
    { key: "n", label: say("outage.colPlayers", { season: labelB }), num: true, get: (c) => c.sizeBefore },
    { key: "stay", label: say("outage.colStayed"), num: true, get: (c) => c.stayed.length },
    { key: "left", label: say("outage.colLeft"), num: true, title: say("outage.colLeftTitle"), get: (c) => c.traded.length + c.gone.length },
    { key: "new", label: say("outage.colArrived"), num: true, title: say("outage.colArrivedTitle"), get: (c) => c.fromElsewhere.length + c.fresh.length },
    { key: "cont", label: say("outage.colContinuity"), num: true, title: say("outage.colContinuityTitle", { after: labelA, before: labelB }), get: (c) => c.continuity, cell: (c) => (c.continuity == null ? "" : `${Math.round(c.continuity * 100)}%`) },
    { key: "ret", label: say("outage.colReturners"), cls: "names", get: () => null, cell: (c) => list(c.stayed, 3) },
    { key: "dep", label: say("outage.colDepartures"), cls: "names", get: () => null, cell: (c) => list([...c.traded, ...c.gone].sort((a, b) => b.gp - a.gp), 3) },
    { key: "arr", label: say("outage.colArrivals"), cls: "names", get: () => null, cell: (c) => list([...c.fromElsewhere, ...c.fresh].sort((a, b) => b.gp - a.gp), 3) },
  ];
  const rosterTable = tableOf(carry, rcols, (c) => c.f);

  const personRow = (p: Person & { club?: number; to?: number }, y: number) => (
    <li key={p.id}>
      {pLink(p)}
      <span className="meta">
        {" "}{plural("count.seasons", p.seasons)}
        {p.club != null || p.to != null ? <> · {team((p.to ?? p.club)!, y, nameOf.get((p.to ?? p.club)!))}</> : null}
      </span>
    </li>
  );

  return (
    <>
      <section className="section">
        <h2>{say("outage.across")}</h2>
        <div className="ba">
          {([[before, fig.b], [after, fig.a]] as const).map(([s, f], k) => (
            <article key={s.year} className="bacard">
              <h3><Link href={seasonPath(lg, s.year)} prefetch={false}>{k === 0 ? say("outage.before", { season: seasonLabel(lg, s.year) }) : say("outage.after", { season: seasonLabel(lg, s.year) })}</Link></h3>
              <p className="champ">
                {s.champion ? <>{say("trophy.champion")}: {team(s.champion_franchise ?? -1, s.year, s.champion)}</> : null}
              </p>
              <dl className="bafig">
                <div><dt>{say("outage.clubs")}</dt><dd>{fmt(f.clubs)}</dd></div>
                {f.scoring != null ? <div><dt>{say("outage.scoring")}</dt><dd>{f.scoring.toFixed(2)}</dd></div> : null}
                {f.best?.strength != null ? <div><dt>{say("outage.best")}</dt><dd>{team(f.best.f, s.year, f.best.name)} <span className="meta">{share(f.best.strength)}</span></dd></div> : null}
                {f.worst?.strength != null ? <div><dt>{say("outage.worst")}</dt><dd>{team(f.worst.f, s.year, f.worst.name)} <span className="meta">{share(f.worst.strength)}</span></dd></div> : null}
                {f.spread != null ? <div><dt>{say("outage.spread", { metric })}</dt><dd>{share(f.spread)}</dd></div> : null}
                {cross ? <div><dt>{say("outage.playersCount")}</dt><dd>{fmt(k === 0 ? cross.playersBefore : cross.playersAfter)}</dd></div> : null}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>{say("outage.slopeTitle")}</h2>
        <OutageSlope
          items={lines.map((l) => ({ f: l.f, name: nameOf.get(l.f) ?? "", abbr: abbrFor(abbrs, l.f, (l.after ? after : before).year, nameOf.get(l.f)), href: paths.team(lg, l.f), a: l.before?.strength ?? null, b: l.after?.strength ?? null }))}
          labelA={labelB} labelB={labelA} hrefA={seasonPath(lg, before.year)} hrefB={seasonPath(lg, after.year)} aria={say("outage.slopeAria", { metric })} note={say("outage.slopeNote", { metric })} />
        <div className="movers">
          {([["risers", risers], ["fallers", fallers]] as const).map(([k, ls]) => (
            <div key={k}>
              <h3>{say(k === "risers" ? "outage.risers" : "outage.fallers")}</h3>
              {ls.length ? (
                <ol>
                  {ls.map((l) => (
                    <li key={l.f}>
                      {team(l.f, after.year)}
                      <span className="meta"> {say("outage.moverLine", { a: l.before!.rank, b: l.after!.rank, delta: `${sign(l.change!)}${share(l.change!)}` })}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="note">{say("outage.noMovers")}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>{say("outage.teamByTeam")}</h2>
        <div className="scroll"><SortTable {...clubs} param="sort_clubs" def="ra.asc" /></div>
        <p className="note">{say("outage.tableNote", { metric })}</p>
      </section>

      <section className="section">
        <h2>{say("outage.changes")}</h2>
        {changes.length ? (
          <ul className="changes">
            {changes.map((c) => (
              <li key={`${c.kind}${c.f}`}>
                <span className="defending">{say(`outage.kind.${c.kind}` as const)}</span>{" "}
                {c.kind === "joined" ? team(c.f, after.year, c.to ?? "")
                  : c.kind === "left" ? team(c.f, before.year, c.from ?? "")
                  : <>{c.from} → {team(c.f, after.year, c.to ?? "")}</>}
              </li>
            ))}
          </ul>
        ) : <p>{say("outage.noChanges", { n: cb.length })}</p>}
        {cb.length !== ca.length ? <p className="note">{say("outage.sizeChange", { a: cb.length, b: ca.length })}</p> : null}
      </section>

      {known ? (
        <section className="section">
          <h2>{say("outage.coaches")}</h2>
          <p>{say("outage.coachSummary", { n: changedCoaches, total: known })}</p>
          <div className="scroll"><SortTable {...coachTable} param="sort_coach" def="team.asc" /></div>
        </section>
      ) : null}

      {carry.length ? (
        <section className="section">
          <h2>{say("outage.rosters")}</h2>
          {cross ? <p>{say("outage.rosterLede", { both: fmt(cross.both), ended: fmt(cross.ended.length), debuts: fmt(cross.debuts.length), league: LG[lg as keyof typeof LG] ?? lg, before: labelB, after: labelA })}</p> : null}
          <div className="scroll"><SortTable {...rosterTable} param="sort_roster" def="cont.desc" /></div>
        </section>
      ) : null}

      {cross && (cross.ended.length || cross.debuts.length || cross.moved.length) ? (
        <section className="section">
          <h2>{say("outage.people")}</h2>
          <div className="plists">
            <div>
              <h3>{say("outage.ended", { n: fmt(cross.ended.length) })}</h3>
              <p className="note">{say("outage.endedNote", { season: labelB })}</p>
              <ul>{cross.ended.slice(0, 12).map((p) => personRow(p, before.year))}</ul>
            </div>
            <div>
              <h3>{say("outage.debuts", { n: fmt(cross.debuts.length) })}</h3>
              <p className="note">{say("outage.debutsNote", { season: labelA })}</p>
              <ul>{cross.debuts.slice(0, 12).map((p) => personRow(p, after.year))}</ul>
            </div>
            <div>
              <h3>{say("outage.moved", { n: fmt(cross.moved.length) })}</h3>
              <p className="note">{say("outage.movedNote")}</p>
              <ul>{cross.moved.slice(0, 12).map((p) => personRow(p, after.year))}</ul>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
