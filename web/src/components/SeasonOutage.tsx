import Link from "@/components/Link";
import { OutageMapNear } from "@/components/OutageMapNear";
import { OutageSlope } from "@/components/OutageSlope";
import { OutageClubsTable, OutageCoachesTable, OutagePeopleList, OutageRostersTable } from "@/components/OutageTables";
import { OutageTeams, Tm } from "@/components/OutageTeams";
import type { SeasonOutageRow, SeasonSummaryRow } from "@/lib/api/types";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import { logoFor, type BrandMap } from "@/lib/brand";
import { getAbbrs, getBrands, getSeasonStandings } from "@/lib/data";
import { atUtc, fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel } from "@/lib/leagues";
import {
  carryOver, coachMoves, crossing, figuresOf, franchiseChanges, lineUp, movers, rankClubs, usesPoints,
  type Person,
} from "@/lib/outage";
import { getHeadCoaches, getIdentities, getOutage, getSeasonRoster, neighbours } from "@/lib/outageData";
import { getPlayerPaths } from "@/lib/playerLinks";
import { seasonPath } from "@/lib/slug";
import { outageClubLines, outageCoachLines, outagePersonLines, outageRosterLines } from "@/lib/outageLines";
import { getPaths } from "@/lib/teamSlugs";
import "@/components/outage.css";

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
      {before ? <OutageMapNear dataHref={`${seasonPath(lg, year)}/rows/outage-map`} season={before.label} /> : null}
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
  const { say, fmt } = await currentSpeaker();
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
  // Each club the page names, and the logo it wore in the season named, told once to the clubs' provider (components/OutageTeams.tsx).
  const used = new Map<string, [number, number, string]>();
  const team = (f: number, y: number, text?: string) => {
    used.set(`${f}:${y}`, [f, y, logoFor(brands, f, y) ?? ""]);
    return <Tm f={f} y={y} text={text} />;
  };
  const changes = franchiseChanges(cb, ca, idB, idA);
  const changeOf = new Map(changes.map((c) => [c.f, c]));
  const fig = { b: figuresOf(cb), a: figuresOf(ca) };
  const { risers, fallers } = movers(lines, 3);
  const coaches = coachMoves(lines.filter((l) => l.before && l.after).map((l) => l.f), coB, coA);
  const carry = carryOver(rosB, rosA);
  const cross = rosB.length && rosA.length ? crossing(rosB, rosA, before.year, after.year) : null;
  const changedCoaches = coaches.filter((c) => c.changed).length, known = coaches.filter((c) => c.changed != null).length;

  /* the tables: one short line a club, built into cells in the browser (components/OutageTables.tsx) */
  const kindOf = (f: number) => changeOf.get(f)?.kind ?? "";
  const sideB = { year: before.year, label: labelB }, sideA = { year: after.year, label: labelA };
  const note = (f: number, y: number) => { used.set(`${f}:${y}`, [f, y, logoFor(brands, f, y) ?? ""]); };
  for (const l of lines) note(l.f, (l.after ? after : before).year);
  for (const c of coaches) note(c.f, after.year);
  for (const c of carry) note(c.f, after.year);
  const pageOf = (p: Person) => player(p.id, p.name, lg);
  const clubLines = outageClubLines(lines, kindOf);
  const coachLines = outageCoachLines(coaches);
  const rosterLines = outageRosterLines(carry, pageOf);
  const peopleList = (ps: (Person & { club?: number; to?: number })[], y: number) => {
    for (const p of ps.slice(0, 12)) { const f = p.to ?? p.club; if (f != null) note(f, y); }
    return <OutagePeopleList lines={outagePersonLines(ps, pageOf, y)} />;
  };

  const body = (
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
        <div className="scroll"><OutageClubsTable lg={lg} lines={clubLines} sideB={sideB} sideA={sideA} points={[usesPoints(stB), usesPoints(stA)]} metric={metric} /></div>
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
          <div className="scroll"><OutageCoachesTable lines={coachLines} sideB={labelB} sideA={labelA} year={after.year} /></div>
        </section>
      ) : null}

      {carry.length ? (
        <section className="section">
          <h2>{say("outage.rosters")}</h2>
          {cross ? <p>{say("outage.rosterLede", { both: fmt(cross.both), ended: fmt(cross.ended.length), debuts: fmt(cross.debuts.length), league: LG[lg as keyof typeof LG] ?? lg, before: labelB, after: labelA })}</p> : null}
          <div className="scroll"><OutageRostersTable lines={rosterLines} sideB={labelB} sideA={labelA} year={after.year} /></div>
        </section>
      ) : null}

      {cross && (cross.ended.length || cross.debuts.length || cross.moved.length) ? (
        <section className="section">
          <h2>{say("outage.people")}</h2>
          <div className="plists">
            <div>
              <h3>{say("outage.ended", { n: fmt(cross.ended.length) })}</h3>
              <p className="note">{say("outage.endedNote", { season: labelB })}</p>
              {peopleList(cross.ended, before.year)}
            </div>
            <div>
              <h3>{say("outage.debuts", { n: fmt(cross.debuts.length) })}</h3>
              <p className="note">{say("outage.debutsNote", { season: labelA })}</p>
              {peopleList(cross.debuts, after.year)}
            </div>
            <div>
              <h3>{say("outage.moved", { n: fmt(cross.moved.length) })}</h3>
              <p className="note">{say("outage.movedNote")}</p>
              {peopleList(cross.moved, after.year)}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
  return (
    <OutageTeams lg={lg} names={[...used.values()].map(([f]) => [f, nameOf.get(f) ?? ""] as [number, string]).filter((v, i, all) => all.findIndex((o) => o[0] === v[0]) === i)} logos={[...used.values()]}>{body}</OutageTeams>
  );
}
