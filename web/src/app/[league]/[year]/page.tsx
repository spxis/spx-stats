import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { SeasonGames } from "@/components/SeasonGames";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { Badge, TeamLink } from "@/components/ui";
import type { StandingRow } from "@/lib/api/types";
import { abbrFor } from "@/lib/abbr";
import { brandFor } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getBrands, getSeason, getSummary } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, isSpx, LG, seasonLabel, srcName } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { parseSelection } from "@/lib/season";
import { parseSort, recShare, tableOf, type ColumnSpec } from "@/lib/sort";


const yearOf = (v: string) => (/^\d{4}$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params }: PageProps<"/[league]/[year]">): Promise<Metadata> {
  const { league, year } = await params;
  const y = yearOf(year);
  if (!isLeague(league) || y == null) return {};
  const { seasons } = await getSummary();
  const s = seasons.find((x) => x.league === league && x.year === y);
  if (!s) return {};
  const { say, plural, fmt, locale } = await currentSpeaker();
  const parts = [say("season.metaLead", { label: s.label, league: LG[league] })];
  if (s.champion) parts.push(say("tip.champion", { team: s.champion }));
  if (s.games) parts.push(say("season.metaGames", { games: plural("count.regularGames", s.games), finals: fmt(s.finals) }));
  return pageMeta({ title: say("season.metaTitle", { label: s.label, league: LG[league] }), description: `${parts.join(say("sentence.sep"))}${say("sentence.end")}`, path: `/${league}/${y}`, locale });
}

export default async function SeasonPage({ params, searchParams }: PageProps<"/[league]/[year]">) {
  const { league: lg, year } = await params;
  const y = yearOf(year);
  if (!isLeague(lg) || y == null) notFound();
  const { say, plural, fmt } = await currentSpeaker();
  const [d, brands, summary] = await Promise.all([getSeason(lg, y), getBrands(), getSummary()]);
  if (!d) notFound();
  const holders = titleHolders(summary.seasons, lg);
  const defending = holders.byYear.get(y - 1)?.champion_franchise;
  const sp = await searchParams;
  const selection = parseSelection(sp);

  const champ = d.awards.find((x) => x.kind === "championship");
  const awards = d.awards.filter((x) => x.kind !== "championship");
  const st = d.standings;
  const pub = st.find((r) => r.basis === "published");
  const basis = pub ? (isSpx(pub.source) ? say("season.basisSpx") : say("season.basisSource", { source: srcName(say, pub.source) })) : say("season.basisDerived");
  const regular = d.games.filter((g) => g[5] === "r");
  const maxPct = Math.max(0, ...st.map((r) => r.pct ?? 0)) || 1;
  const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);

  const played = new Set(d.games.flatMap((g) => [g[1], g[4]]));
  const cols: ColumnSpec<StandingRow>[] = [
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => (
        <>
          <TeamLogo url={brandFor(brands, r.franchise_id, y)?.logo_url} />
          <Link href={played.has(r.team_id) ? `/${lg}/${y}/team/${r.franchise_id}` : `/${lg}/team/${r.franchise_id}`} prefetch={false}><span className="tn-long">{r.team}</span><abbr className="tn-short" title={r.team ?? undefined}>{abbrFor(lg, r.franchise_id, y, r.team)}</abbr></Link>
          {defending != null && r.franchise_id === defending ? (
            <span className="defending" title={say("season.wonTitle", { season: seasonLabel(lg, y - 1) })}>{say("season.defending")}</span>
          ) : null}
        </>
      ),
    },
    {
      key: "gp", label: say("col.gp"), num: true, title: say("col.gpTeamTitle"), get: (r) => r.gp,
      cell: (r) => (r.gp != null && played.has(r.team_id) ? (
        <Link href={`/${lg}/${y}/team/${r.franchise_id}`} prefetch={false} title={say("season.teamGames", { team: r.team ?? "", label: d.label })}>{r.gp}</Link>
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
  const sort = parseSort(sp.sort, cols.map((c) => c.key), "pct.desc");
  return (
    <>
      <AccentStyle league={lg} />
      <section className="head fade">
        <nav className="seasonnav" aria-label={say("season.otherSeasons")}>
          <Link href={`/${lg}/${y - 1}`} rel="prev">{"← " + seasonLabel(lg, y - 1)}</Link>
          <Link href={`/${lg}/${y + 1}`} rel="next">{seasonLabel(lg, y + 1) + " →"}</Link>
        </nav>
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{say("season.title", { label: d.label })}</h1>
        <p className="lede">{say("season.lede", { games: plural("count.regularGames", regular.length), finals: fmt(regular.filter((g) => g[6] === "f").length) })}</p>
      </section>
      {champ ? (
        <section className="banner">
          <span className="cup">{champ.award}</span>
          <Badge src={champ.source} />
          <span className="who"><TeamLink lg={lg} f={champ.franchise_id} name={champ.winner} year={d.teams.some((t) => t.f === champ.franchise_id && played.has(t.id)) ? y : undefined} /></span>
          <span className="how">{champ.note || ""}</span>
        </section>
      ) : null}
      {st.length ? (
        <section className="section">
          <h2>{say("season.standings")}</h2>
          <p className="note">{say("season.standingsNote", { basis })}</p>
          <div className="scroll"><SortTable {...standings} def="pct.desc" initial={sort} /></div>
        </section>
      ) : null}
      {awards.length ? (
        <section className="section">
          <h2>{say("season.awards")}</h2>
          <div className="awards">
            {awards.map((a, i) => (
              <div className="award" key={i}>
                <span className="name">{a.award}</span>
                <span className="winner"><TeamLink lg={lg} f={a.franchise_id} name={a.winner} year={d.teams.some((t) => t.f === a.franchise_id && played.has(t.id)) ? y : undefined} /></span>
                <span className="note">{a.note || ""} <Badge src={a.source} /></span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {d.games.length ? (
        <section className="section">
          <h2>{say("season.games")}</h2>
          <SeasonGames lg={lg} year={y} games={d.games} teams={d.teams} initial={selection} />

        </section>
      ) : null}
    </>
  );
}
