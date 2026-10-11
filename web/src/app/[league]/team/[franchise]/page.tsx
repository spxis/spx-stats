import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { SortTable } from "@/components/SortTable";
import { TeamAlignment } from "@/components/TeamAlignment";
import { TeamAwards } from "@/components/TeamAwards";
import { TeamCharts } from "@/components/TeamCharts";
import { TeamFlag } from "@/components/TeamFlag";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamMapCorner, type Pin } from "@/components/TeamMap";
import { BadgeCup, MiniCup, Trophy } from "@/components/TrophyIcon";
import { Figures, NoSeason } from "@/components/ui";
import { WinLine } from "@/components/WinLine";
import type { StandingRow } from "@/lib/api/types";
import { abbrFor, type AbbrMap } from "@/lib/abbr";
import { brandFor, logoFor, teamAccent, type BrandMap } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { placeFor } from "@/lib/venue";
import { titleHolders } from "@/lib/champions";
import { getAbbrs, getBrands, getClubs, getSummary, getTeam, getTeamStandings } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { idleYears } from "@/lib/noSeason";
import { recShare, tableOf } from "@/lib/sort";

// Drawn per request (the language cookie); the data behind it keeps its one-hour cache (next: { revalidate } in lib/api/client.ts).

const idOf = (v: string) => (/^\d{1,9}$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params }: PageProps<"/[league]/team/[franchise]">): Promise<Metadata> {
  const { league, franchise } = await params;
  const f = idOf(franchise);
  if (!isLeague(league) || f == null) return {};
  const t = await getTeam(league, f);
  if (!t) return {};
  const { say, plural, locale } = await currentSpeaker();
  const name = t.names.at(-1)?.name || say("team.fallback", { id: f });
  const n = t.titles.length;
  return pageMeta({
    title: `${name} · ${LG[league]}`,
    description: say("team.metaDesc", { name, seasons: plural("count.seasons", t.seasons.length), titles: n ? say("team.titlesSuffix", { titles: plural("count.championships", n) }) : "" }),
    path: `/${league}/team/${f}`,
    locale,
  });
}

function sum(rows: StandingRow[], k: "w" | "l" | "t" | "otl" | "gp") {
  return rows.reduce((a, r) => a + (r[k] || 0), 0);
}

async function Lifetime({ lg, rows }: { lg: string; rows: StandingRow[] }) {
  const { say } = await currentSpeaker();
  const w = sum(rows, "w"), l = sum(rows, "l"), t = sum(rows, "t"), o = sum(rows, "otl"), gp = sum(rows, "gp");
  const pct = w + l + t + o ? (w + t / 2) / (w + l + t + o) : null;
  const figs: [string, number | string][] = [[say("fig.seasons"), rows.length], [say("fig.games"), gp], [say("fig.wins"), w], [say("fig.losses"), l]];
  if (t) figs.push([say("fig.ties"), t]);
  if (o) figs.push([say(lg === "nhl" ? "fig.otLosses" : "fig.ot"), o]);
  figs.push([say("fig.share"), pct == null ? "—" : fmt3(pct)]);
  return (
    <section className="section">
      <h2>{say("team.allTime")}</h2>
      <Figures items={figs} />
      <p className="note">{say("team.allTimeNote")}</p>
    </section>
  );
}

function pins(lg: string, abbrs: AbbrMap, clubs: { franchise_id: number; team: string | null }[], brands: BrandMap, year: number, f: number): Pin[] {
  return clubs.flatMap((c) => {
    const b = placeFor(brands, c.franchise_id, year);
    return b && b.latitude != null && b.longitude != null
      ? [{ f: c.franchise_id, name: c.team ?? "", abbr: abbrFor(abbrs, c.franchise_id, year, c.team), lat: b.latitude, lon: b.longitude, venue: b.home_venue, href: `/${lg}/team/${c.franchise_id}`, me: c.franchise_id === f }]
      : [];
  });
}

export default async function TeamPage({ params }: PageProps<"/[league]/team/[franchise]">) {
  const { league: lg, franchise } = await params;
  const f = idOf(franchise);
  if (!isLeague(lg) || f == null) notFound();
  const { say, plural, fmt } = await currentSpeaker();
  const [t, rows, brands, abbrs, summary] = await Promise.all([getTeam(lg, f), getTeamStandings(lg, f), getBrands(), getAbbrs(lg), getSummary()]);
  if (!t) notFound();
  const names = t.names;
  const now = names.at(-1)?.name || say("team.fallback", { id: f });
  const b = brandFor(brands, f);
  const reigning = titleHolders(summary.seasons, lg).reigning;
  const won = new Set(t.titles);
  const showT = rows.some((r) => r.t), showO = rows.some((r) => r.otl), showP = rows.some((r) => r.pts != null);
  const maxPct = Math.max(0, ...rows.map((r) => r.pct ?? 0)) || 1;

  // The corner map: the team's home in the latest season it has results for; the dialog shows every team that season.
  const lastYear = rows.length ? Math.max(...rows.map((r) => r.year)) : null;
  const me = lastYear != null ? placeFor(brands, f, lastYear) : null;
  let map: React.ReactNode = null;
  if (lastYear != null && me && me.latitude != null && me.longitude != null) {
    const clubs = await getClubs(lg, lastYear);
    map = (
      <TeamMapCorner
        me={{ f, name: now, abbr: abbrFor(abbrs, f, lastYear, now), lat: me.latitude, lon: me.longitude, venue: me.home_venue, me: true }}
        others={pins(lg, abbrs, clubs, brands, lastYear, f)} clubCount={clubs.length}
        seasonLabel={seasonLabel(lg, lastYear)} leagueShort={LG[lg]} name={now}
      />
    );
  }

  const withGames = new Set(summary.seasons.filter((x) => x.league === lg && x.games > 0).map((x) => x.year));
  const idle = idleYears(rows, summary.seasons, lg);
  const gaps: StandingRow[] = [...idle].filter(([y]) => !rows.some((r) => r.year === y)).map(([y]) => ({
    league: lg, year: y, team_id: 0, franchise_id: f, team: null, gp: null, w: null, l: null, t: null, otl: null, pts: null,
    pf: null, pa: null, home: null, road: null, pct: null, basis: "none", source: null,
  }));
  const tableRows = [...rows, ...gaps].sort((a, b) => b.year - a.year);
  const standings = tableOf(tableRows, [
    {
      key: "champ", label: say("col.champion"), hideLabel: true, cls: "cupcol", title: say("team.champSeason"), get: (r) => (won.has(r.year) ? 1 : 0),
      cell: (r) => (won.has(r.year) ? <MiniCup league={lg} /> : null),
    },
    {
      key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (r) => r.year,
      cell: (r) => <Link href={`/${lg}/${r.year}`} prefetch={false}>{seasonLabel(lg, r.year)}</Link>,
    },
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => idle.has(r.year) ? <NoSeason kind={idle.get(r.year)} /> : <><span className="tn-long">{r.team || ""}</span><abbr className="tn-short" title={r.team ?? undefined}>{abbrFor(abbrs, f, r.year, r.team)}</abbr></>,
    },
    {
      key: "gp", label: say("col.gp"), num: true, title: say("col.gpSeasonTitle"), get: (r) => r.gp,
      cell: (r) => (r.gp != null && withGames.has(r.year) ? (
        <Link href={`/${lg}/${r.year}/team/${f}`} prefetch={false} title={say("team.everyGame", { season: seasonLabel(lg, r.year) })}>{r.gp}</Link>
      ) : r.gp ?? ""),
    },
    { key: "w", label: say("col.w"), num: true, get: (r) => r.w }, { key: "l", label: say("col.l"), num: true, get: (r) => r.l },
    ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (r: StandingRow) => r.t }] : []),
    ...(showO ? [{ key: "otl", label: say("col.otl"), num: true, get: (r: StandingRow) => r.otl }] : []),
    ...(showP ? [{ key: "pts", label: say("col.pts"), num: true, get: (r: StandingRow) => r.pts }] : []),
    { key: "pf", label: say("col.pf"), num: true, get: (r) => r.pf, cell: (r) => (r.pf != null ? fmt(r.pf) : "") },
    { key: "pa", label: say("col.pa"), num: true, get: (r) => r.pa, cell: (r) => (r.pa != null ? fmt(r.pa) : "") },
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
  ], (r) => r.year, (r) => (idle.has(r.year) ? "idlerow" : undefined));
  const nameTable = tableOf(names, [
    { key: "name", label: say("col.name"), cls: "team", get: (n) => n.name },
    { key: "from", label: say("col.from"), get: (n) => n.from, cell: (n) => n.from || "" },
    { key: "until", label: say("col.until"), get: (n) => n.to || "9999", cell: (n) => n.to || say("team.today") },
  ], (n, i) => `${i}|${n.name}`);
  const place = placeFor(brands, f, lastYear ?? undefined);
  const country = countryAt(place?.latitude, place?.longitude);
  return (
    <>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      {b?.primary_hex ? (
        <div className="teamband" style={{ "--tp": `#${b.primary_hex}`, "--ts": `#${b.secondary_hex || b.primary_hex}` } as React.CSSProperties} />
      ) : null}
      <section className="head fade">
        {map}
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link></span>
        <h1 className="teamname"><TeamLogo url={logoFor(brands, f)} size={56} />{now}<TeamFlag code={country} /></h1>
        {reigning && reigning.champion_franchise === f ? (
          <Link className="reigning" href={`/${lg}/${reigning.year}`}>
            <BadgeCup league={lg} />
            {say("team.reigning", { season: reigning.label })}
          </Link>
        ) : null}
        <p className="lede">{say("team.lede", { seasons: plural("count.seasons", t.seasons.length), titles: t.titles.length ? say("team.titlesSuffix", { titles: plural("count.championships", t.titles.length) }) : "" })}</p>
      </section>
      {rows.length ? <Lifetime lg={lg} rows={rows} /> : null}
      {t.titles.length ? (
        <div className="trophyrow fade">
          <div className="trophies"><b>{t.titles.length}</b><Trophy league={lg} className="cup" /></div>
          <div className="champs">
            <h2>{say("team.championships")}</h2>
            <div className="seasonlist">
              {t.titles.map((y) => <Link key={y} className="full" href={`/${lg}/${y}`}>{seasonLabel(lg, y)}</Link>)}
            </div>
          </div>
        </div>
      ) : null}
      {rows.length ? (
        <TeamCharts lg={lg} f={f} rows={rows} titles={t.titles} seasons={t.seasons} idle={[...idle]} />
      ) : (
        <section className="section">
          <h2>{say("team.winTitle")}</h2>
          <p className="note">{say("team.winNote")}</p>
          <WinLine seasons={t.seasons} titles={t.titles} lg={lg} idle={[...idle]} />
        </section>
      )}
      {rows.length ? (
        <section className="section">
          <h2>{say("team.standings")}</h2>
          <p className="note">{say("team.standingsNote", { seasons: plural("count.seasons", rows.length) })}</p>
          <div className="tablebox"><SortTable {...standings} def="season.desc" /></div>
        </section>
      ) : null}
      <TeamAwards lg={lg} f={f} />
      <TeamAlignment lg={lg} f={f} />
      {names.length ? (
        <section className="section">
          <h2>{say("team.names")}</h2>
          <SortTable {...nameTable} param="sort_names" />
        </section>
      ) : null}
    </>
  );
}
