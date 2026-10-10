import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { SeasonGames } from "@/components/SeasonGames";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { Badge, TeamLink } from "@/components/ui";
import type { StandingRow } from "@/lib/api/types";
import { brandFor } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getBrands, getSeason, getSummary } from "@/lib/data";
import { fmt, fmt3 } from "@/lib/format";
import { isLeague, isSpx, LG, seasonLabel, SRC } from "@/lib/leagues";
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
  const parts = [`${s.label} ${LG[league]} season: standings, scores and awards`];
  if (s.champion) parts.push(`Champion: ${s.champion}`);
  if (s.games) parts.push(`${fmt(s.games)} regular-season games, ${fmt(s.finals)} with a result`);
  return pageMeta({ title: `${s.label} ${LG[league]} season`, description: `${parts.join(". ")}.`, path: `/${league}/${y}` });
}

export default async function SeasonPage({ params, searchParams }: PageProps<"/[league]/[year]">) {
  const { league: lg, year } = await params;
  const y = yearOf(year);
  if (!isLeague(lg) || y == null) notFound();
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
  const basis = pub ? "As " + (isSpx(pub.source) ? "SPX" : "the " + (SRC[pub.source ?? ""] || pub.source)) + " published them" : "Worked out from the final scores";
  const regular = d.games.filter((g) => g[5] === "r");
  const maxPct = Math.max(0, ...st.map((r) => r.pct ?? 0)) || 1;
  const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);

  const played = new Set(d.games.flatMap((g) => [g[1], g[4]]));
  const cols: ColumnSpec<StandingRow>[] = [
    {
      key: "team", label: "Team", cls: "team", get: (r) => r.team,
      cell: (r) => (
        <>
          <TeamLogo url={brandFor(brands, r.franchise_id, y)?.logo_url} />
          <Link href={`/${lg}/team/${r.franchise_id}`} prefetch={false}>{r.team}</Link>
          {defending != null && r.franchise_id === defending ? (
            <span className="defending" title={`Won the ${seasonLabel(lg, y - 1)} title`}>Defending champion</span>
          ) : null}
        </>
      ),
    },
    {
      key: "gp", label: "GP", num: true, title: "Games played; opens the team's whole season", get: (r) => r.gp,
      cell: (r) => (r.gp != null && played.has(r.team_id) ? (
        <Link href={`/${lg}/${y}/team/${r.franchise_id}`} prefetch={false} title={`Every ${r.team} game of ${d.label}`}>{r.gp}</Link>
      ) : r.gp ?? ""),
    },
    { key: "w", label: "W", num: true, get: (r) => r.w }, { key: "l", label: "L", num: true, get: (r) => r.l },
    ...(showT ? [{ key: "t", label: "T", num: true, get: (r: StandingRow) => r.t }] : []),
    ...(showO ? [{ key: "otl", label: "OTL", num: true, get: (r: StandingRow) => r.otl }] : []),
    ...(showP ? [{ key: "pts", label: "Pts", num: true, get: (r: StandingRow) => r.pts }] : []),
    { key: "pf", label: "For", num: true, get: (r) => r.pf, cell: (r) => (r.pf != null ? fmt(r.pf) : "") },
    { key: "pa", label: "Against", num: true, get: (r) => r.pa, cell: (r) => (r.pa != null ? fmt(r.pa) : "") },
    { key: "home", label: "Home", get: (r) => recShare(r.home), cell: (r) => r.home || "" },
    { key: "road", label: "Road", get: (r) => recShare(r.road), cell: (r) => r.road || "" },
    {
      key: "pct", label: "Pct", num: true, get: (r) => r.pct,
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
        <nav className="seasonnav" aria-label="Other seasons">
          <Link href={`/${lg}/${y - 1}`} rel="prev">{"← " + seasonLabel(lg, y - 1)}</Link>
          <Link href={`/${lg}/${y + 1}`} rel="next">{seasonLabel(lg, y + 1) + " →"}</Link>
        </nav>
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1>{`${d.label} season`}</h1>
        <p className="lede">{`${fmt(regular.length)} regular-season games, ${fmt(regular.filter((g) => g[6] === "f").length)} with a result.`}</p>
      </section>
      {champ ? (
        <section className="banner">
          <span className="cup">{champ.award}</span>
          <Badge src={champ.source} />
          <span className="who"><TeamLink lg={lg} f={champ.franchise_id} name={champ.winner} /></span>
          <span className="how">{champ.note || ""}</span>
        </section>
      ) : null}
      {st.length ? (
        <section className="section">
          <h2>Standings</h2>
          <p className="note">{basis + ". Press a column to sort. Games played opens that team's whole season."}</p>
          <div className="scroll"><SortTable {...standings} def="pct.desc" initial={sort} /></div>
        </section>
      ) : null}
      {awards.length ? (
        <section className="section">
          <h2>Awards</h2>
          <div className="awards">
            {awards.map((a, i) => (
              <div className="award" key={i}>
                <span className="name">{a.award}</span>
                <span className="winner"><TeamLink lg={lg} f={a.franchise_id} name={a.winner} /></span>
                <span className="note">{a.note || ""} <Badge src={a.source} /></span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {d.games.length ? (
        <section className="section">
          <h2>Games</h2>
          <SeasonGames lg={lg} games={d.games} teams={d.teams} initial={selection} />
        </section>
      ) : null}
    </>
  );
}
