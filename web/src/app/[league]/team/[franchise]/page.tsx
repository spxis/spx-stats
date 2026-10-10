import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamMapCorner, type Pin } from "@/components/TeamMap";
import { BadgeCup, MiniCup, Trophy } from "@/components/TrophyIcon";
import { Figures } from "@/components/ui";
import { WinLine } from "@/components/WinLine";
import type { StandingRow } from "@/lib/api/types";
import { brandFor, teamAccent, type BrandMap } from "@/lib/brand";
import { titleHolders } from "@/lib/champions";
import { getBrands, getClubs, getSummary, getTeam, getTeamStandings } from "@/lib/data";
import { fmt, fmt3 } from "@/lib/format";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";

export const revalidate = 3600;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const idOf = (v: string) => (/^\d{1,9}$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params }: PageProps<"/[league]/team/[franchise]">): Promise<Metadata> {
  const { league, franchise } = await params;
  const f = idOf(franchise);
  if (!isLeague(league) || f == null) return {};
  const t = await getTeam(league, f);
  if (!t) return {};
  const name = t.names.at(-1)?.name || `Team ${f}`;
  const n = t.titles.length;
  return pageMeta({
    title: `${name} · ${LG[league]}`,
    description: `${name} all-time record, standings by season and names over time: ${t.seasons.length} seasons of results${n ? `, ${n} championship${n === 1 ? "" : "s"}` : ""}.`,
    path: `/${league}/team/${f}`,
  });
}

function sum(rows: StandingRow[], k: "w" | "l" | "t" | "otl" | "gp") {
  return rows.reduce((a, r) => a + (r[k] || 0), 0);
}

function Lifetime({ lg, rows }: { lg: string; rows: StandingRow[] }) {
  const w = sum(rows, "w"), l = sum(rows, "l"), t = sum(rows, "t"), o = sum(rows, "otl"), gp = sum(rows, "gp");
  const pct = w + l + t + o ? (w + t / 2) / (w + l + t + o) : null;
  const figs: [string, number | string][] = [["Seasons", rows.length], ["Games", gp], ["Wins", w], ["Losses", l]];
  if (t) figs.push(["Ties", t]);
  if (o) figs.push([lg === "nhl" ? "OT losses" : "OT", o]);
  figs.push(["Winning share", pct == null ? "—" : fmt3(pct)]);
  return (
    <section className="section">
      <h2>All-time record</h2>
      <Figures items={figs} />
      <p className="note">Regular seasons only. Winning share counts a tie as half a win and an overtime loss as a loss.</p>
    </section>
  );
}

function pins(lg: string, clubs: { franchise_id: number; team: string | null }[], brands: BrandMap, year: number, f: number): Pin[] {
  return clubs.flatMap((c) => {
    const b = brandFor(brands, c.franchise_id, year);
    return b && b.latitude != null && b.longitude != null
      ? [{ f: c.franchise_id, name: c.team ?? "", lat: b.latitude, lon: b.longitude, venue: b.home_venue, href: `/${lg}/team/${c.franchise_id}`, me: c.franchise_id === f }]
      : [];
  });
}

export default async function TeamPage({ params }: PageProps<"/[league]/team/[franchise]">) {
  const { league: lg, franchise } = await params;
  const f = idOf(franchise);
  if (!isLeague(lg) || f == null) notFound();
  const [t, rows, brands, summary] = await Promise.all([getTeam(lg, f), getTeamStandings(lg, f), getBrands(), getSummary()]);
  if (!t) notFound();
  const names = t.names;
  const now = names.at(-1)?.name || `Team ${f}`;
  const b = brandFor(brands, f);
  const reigning = titleHolders(summary.seasons, lg).reigning;
  const won = new Set(t.titles);
  const showT = rows.some((r) => r.t), showO = rows.some((r) => r.otl), showP = rows.some((r) => r.pts != null);
  const maxPct = Math.max(0, ...rows.map((r) => r.pct ?? 0)) || 1;

  // The corner map: the team's home in the latest season it has results for; the dialog shows every team that season.
  const lastYear = rows.length ? Math.max(...rows.map((r) => r.year)) : null;
  const me = lastYear != null ? brandFor(brands, f, lastYear) : null;
  let map: React.ReactNode = null;
  if (lastYear != null && me && me.latitude != null && me.longitude != null) {
    const clubs = await getClubs(lg, lastYear);
    map = (
      <TeamMapCorner
        me={{ f, name: now, lat: me.latitude, lon: me.longitude, venue: me.home_venue, me: true }}
        others={pins(lg, clubs, brands, lastYear, f)} clubCount={clubs.length}
        seasonLabel={seasonLabel(lg, lastYear)} leagueShort={LG[lg]} name={now}
      />
    );
  }

  return (
    <>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      {b?.primary_hex ? (
        <div className="teamband" style={{ "--tp": `#${b.primary_hex}`, "--ts": `#${b.secondary_hex || b.primary_hex}` } as React.CSSProperties} />
      ) : null}
      <section className="head fade">
        {map}
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1 className="teamname"><TeamLogo url={b?.logo_url} size={56} />{now}</h1>
        {reigning && reigning.champion_franchise === f ? (
          <Link className="reigning" href={`/${lg}/${reigning.year}`}>
            <BadgeCup league={lg} />
            {`Reigning champions · ${reigning.label}`}
          </Link>
        ) : null}
        <p className="lede">{`${t.seasons.length} seasons of results${t.titles.length ? `, ${t.titles.length} championship${t.titles.length === 1 ? "" : "s"}` : ""}.`}</p>
      </section>
      {rows.length ? <Lifetime lg={lg} rows={rows} /> : null}
      {t.titles.length ? (
        <div className="trophyrow fade">
          <div className="trophies"><b>{t.titles.length}</b><Trophy league={lg} className="cup" /></div>
          <div className="champs">
            <h2>Championships</h2>
            <div className="seasonlist">
              {t.titles.map((y) => <Link key={y} className="full" href={`/${lg}/${y}`}>{seasonLabel(lg, y)}</Link>)}
            </div>
          </div>
        </div>
      ) : null}
      <section className="section">
        <h2>Winning share by season</h2>
        <p className="note">Filled dots are championship seasons. Click a season to open it.</p>
        <WinLine seasons={t.seasons} titles={t.titles} lg={lg} />
      </section>
      {rows.length ? (
        <section className="section">
          <h2>Standings by season</h2>
          <p className="note">{`${rows.length} season${rows.length === 1 ? "" : "s"}, newest first. The trophy marks a championship season.`}</p>
          <div className="tablebox">
            <table>
              <thead>
                <tr>
                  <th>Season</th><th>Team</th><th className="num">GP</th><th className="num">W</th><th className="num">L</th>
                  {showT ? <th className="num">T</th> : null}{showO ? <th className="num">OTL</th> : null}{showP ? <th className="num">Pts</th> : null}
                  <th className="num">PF</th><th className="num">PA</th><th>Home</th><th>Road</th><th>Pct</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year}>
                    <td className="seasoncell"><Link href={`/${lg}/${r.year}`}>{seasonLabel(lg, r.year)}</Link>{won.has(r.year) ? <MiniCup league={lg} /> : null}</td>
                    <td className="team">{r.team || ""}</td>
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
      {names.length ? (
        <section className="section">
          <h2>Names over time</h2>
          <table>
            <thead><tr><th>Name</th><th>From</th><th>Until</th></tr></thead>
            <tbody>
              {names.map((n, i) => <tr key={i}><td className="team">{n.name}</td><td>{n.from || ""}</td><td>{n.to || "today"}</td></tr>)}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
