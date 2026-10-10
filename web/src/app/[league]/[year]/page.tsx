import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { SeasonGames } from "@/components/SeasonGames";
import { TeamLogo } from "@/components/TeamLogo";
import { Badge, TeamLink } from "@/components/ui";
import { brandFor } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getBrands, getSeason, getSummary } from "@/lib/data";
import { fmt, fmt3 } from "@/lib/format";
import { isLeague, isSpx, LG, seasonLabel, SRC } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { parseSelection } from "@/lib/season";


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
  const selection = parseSelection(await searchParams);

  const champ = d.awards.find((x) => x.kind === "championship");
  const awards = d.awards.filter((x) => x.kind !== "championship");
  const st = d.standings;
  const pub = st.find((r) => r.basis === "published");
  const basis = pub ? "As " + (isSpx(pub.source) ? "SPX" : "the " + (SRC[pub.source ?? ""] || pub.source)) + " published them" : "Worked out from the final scores";
  const regular = d.games.filter((g) => g[5] === "r");
  const maxPct = Math.max(0, ...st.map((r) => r.pct ?? 0)) || 1;
  const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);

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
          <p className="note">{basis + ". Sorted by share of games won."}</p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Team</th><th className="num">GP</th><th className="num">W</th><th className="num">L</th>
                  {showT ? <th className="num">T</th> : null}{showO ? <th className="num">OTL</th> : null}{showP ? <th className="num">Pts</th> : null}
                  <th className="num">For</th><th className="num">Against</th><th>Home</th><th>Road</th><th>Pct</th>
                </tr>
              </thead>
              <tbody>
                {st.map((r) => (
                  <tr key={r.team_id}>
                    <td className="team">
                      <TeamLogo url={brandFor(brands, r.franchise_id, y)?.logo_url} />
                      <Link href={`/${lg}/team/${r.franchise_id}`} prefetch={false}>{r.team}</Link>
                      {defending != null && r.franchise_id === defending ? (
                        <span className="defending" title={`Won the ${seasonLabel(lg, y - 1)} title`}>Defending champion</span>
                      ) : null}
                    </td>
                    <td className="num">{r.gp ?? ""}</td><td className="num">{r.w ?? ""}</td><td className="num">{r.l ?? ""}</td>
                    {showT ? <td className="num">{r.t ?? ""}</td> : null}{showO ? <td className="num">{r.otl ?? ""}</td> : null}{showP ? <td className="num">{r.pts ?? ""}</td> : null}
                    <td className="num">{r.pf != null ? fmt(r.pf) : ""}</td><td className="num">{r.pa != null ? fmt(r.pa) : ""}</td>
                    <td>{r.home || ""}</td><td>{r.road || ""}</td>
                    <td>
                      {r.pct != null ? fmt3(r.pct) : ""}
                      {r.pct != null ? <span className="pctbar" style={{ width: `${Math.round((60 * r.pct) / maxPct)}px` }} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
