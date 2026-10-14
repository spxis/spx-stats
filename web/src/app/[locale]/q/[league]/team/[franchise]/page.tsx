import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { CompareControl } from "@/components/CompareControl";
import { SortTable } from "@/components/SortTable";
import { TeamAlignment } from "@/components/TeamAlignment";
import { TeamAwards } from "@/components/TeamAwards";
import { FranchiseCountries } from "@/components/FranchiseCountries";
import { TeamCharts } from "@/components/TeamCharts";
import { Credits } from "@/components/Credits";
import { AddressLink } from "@/components/AddressLink";
import { venueMapsUrl } from "@/lib/venueAddress";
import { Flag } from "@/components/Flag";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamMapCorner, type Pin } from "@/components/TeamMap";
import { FranchiseVenueNotes } from "@/components/FranchiseVenueNotes";
import { VenueMap } from "@/components/VenueMap";
import { BadgeCup, MiniCup, Trophy } from "@/components/TrophyIcon";
import { Figures, NoSeason } from "@/components/ui";
import { WinLine } from "@/components/WinLine";
import { getSeasonAlignment } from "@/lib/alignmentData";
import type { StandingRow } from "@/lib/api/types";
import { abbrFor } from "@/lib/abbr";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { placeFor } from "@/lib/venue";
import { titleHolders, titleStreak } from "@/lib/champions";
import { getOutageYears } from "@/lib/outageData";
import { getAbbrs, getBrands, getClubs, getSummary, getTeam, getTeamPhases, getTeamStandings } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { getTeamAwards } from "@/lib/people";
import { seasonPath } from "@/lib/slug";
import { getLeagueClubs, getPaths, teamOf } from "@/lib/teamSlugs";
import { TeamSwitch } from "@/components/TeamSwitch";
import { getClubCity } from "@/lib/cityData";
import { cupTitlesOf } from "@/lib/cup";
import { getCupTitles } from "@/lib/cupData";
import "@/components/city.css";
import { clubPins, getVenueTeams } from "@/lib/venueMap";
import { getVenuePlaces, placeKey } from "@/lib/venuePlace";
import { factsLine, getVenueFacts, getVenueNames, nameIn, nowName, placeAddress } from "@/lib/venueName";
import { idleYears } from "@/lib/noSeason";
import { recShare, tableOf } from "@/lib/sort";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/[league]/team/[franchise] keeps this page and revalidates it every hour. The data behind it keeps its one-hour cache (lib/api/client.ts).

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/q/[league]/team/[franchise]">): Promise<Metadata> => {
  const { league, franchise } = await params;
  if (!isLeague(league)) return {};
  const at = await teamOf(league, franchise);
  if (!at) return {};
  const f = at.f;
  const t = await getTeam(league, f);
  if (!t) return {};
  const { say, plural, locale } = await currentSpeaker();
  const name = t.names.at(-1)?.name || say("team.fallback", { id: f });
  const n = t.titles.length + (league === "nhl" ? cupTitlesOf(await getCupTitles(), f).length : 0);
  return pageMeta({
    title: `${name} · ${LG[league]}`,
    description: t.seasons.length || !t.unrecorded.length
      ? say("team.metaDesc", { name, seasons: plural("count.seasons", t.seasons.length), titles: n ? say("team.titlesSuffix", { titles: plural("count.championships", n) }) : "" })
      : say("team.metaDescBare", { name, seasons: plural("count.seasons", t.unrecorded.length), titles: n ? say("team.titlesSuffix", { titles: plural("count.championships", n) }) : "" }),
    path: at.path,
    locale,
  });
});

function sum(rows: StandingRow[], k: "w" | "l" | "t" | "otl" | "gp") {
  return rows.reduce((a, r) => a + (r[k] || 0), 0);
}

async function Lifetime({ lg, f, rows }: { lg: string; f: number; rows: StandingRow[] }) {
  const { say } = await currentSpeaker();
  const awards = await getTeamAwards(lg, f);
  const w = sum(rows, "w"), l = sum(rows, "l"), t = sum(rows, "t"), o = sum(rows, "otl"), gp = sum(rows, "gp");
  const pct = w + l + t + o ? (w + t / 2) / (w + l + t + o) : null;
  const figs: [string, number | string][] = [[say("fig.seasons"), rows.length], [say("fig.games"), gp], [say("fig.wins"), w], [say("fig.losses"), l]];
  if (t) figs.push([say("fig.ties"), t]);
  if (o) figs.push([say(lg === "nhl" ? "fig.otLosses" : "fig.ot"), o]);
  if (awards) figs.push([say("fig.awards"), awards.length]);
  figs.push([say("fig.share"), pct == null ? "—" : fmt3(pct)]);
  return (
    <section className="section">
      <h2>{say("team.allTime")}</h2>
      <Figures items={figs} />
      <p className="note">{say("team.allTimeNote")}</p>
    </section>
  );
}

export default guard(async function TeamPage({ params, searchParams }: PageProps<"/[locale]/q/[league]/team/[franchise]">) {
  const { league: lg, franchise } = await params;
  const sp = await searchParams;
  if (!isLeague(lg)) notFound();
  const at = await teamOf(lg, franchise);
  if (!at) notFound();
  if (at.path !== `/${lg}/team/${franchise}`) permanentRedirect(at.path);
  const f = at.f;
  const paths = await getPaths();
  const { say, plural, fmt, locale } = await currentSpeaker();
  const [t, rows, brands, abbrs, summary, venuePlaces] = await Promise.all([getTeam(lg, f), getTeamStandings(lg, f), getBrands(), getAbbrs(lg), getSummary(), getVenuePlaces(lg)]);
  const [venueNames, venueFacts, outageYears] = await Promise.all([getVenueNames(), getVenueFacts(), getOutageYears(lg)]);
  if (!t) notFound();
  // Stanley Cup titles the club won before the NHL's first season (lib/cup.ts): listed with the championships, not linked (there is no NHL season to open).
  const cup = lg === "nhl" ? cupTitlesOf(await getCupTitles(), f) : [];
  const nTitles = t.titles.length + cup.length;
  // A club with no recorded name span (the early Stanley Cup challengers) gets the years of its seasons, so a club that is gone does not read "until today".
  const seasonYears = [...t.seasons.map((x) => x[0]), ...t.unrecorded.map((x) => x[0])];
  const latestYear = Math.max(0, ...summary.seasons.filter((x) => x.league === lg).map((x) => x.year));
  const names = t.names.map((n) => (n.from == null && n.to == null && seasonYears.length && Math.max(...seasonYears) < latestYear ? { ...n, from: String(Math.min(...seasonYears)), to: String(Math.max(...seasonYears)) } : n));
  const now = names.at(-1)?.name || say("team.fallback", { id: f });
  const b = brandFor(brands, f);
  const holders = titleHolders(summary.seasons, lg, outageYears);
  const reigning = holders.reigning;
  const streak = reigning && reigning.champion_franchise === f ? titleStreak(holders.byYear, f, reigning.year, holders.sat) : 0;
  const won = new Set(t.titles);
  const showT = rows.some((r) => r.t), showO = rows.some((r) => r.otl), showP = rows.some((r) => r.pts != null);
  const maxPct = Math.max(0, ...rows.map((r) => r.pct ?? 0)) || 1;

  // The corner map: the team's home in the latest season it has results for; the dialog shows every team that season.
  const lastYear = rows.length ? Math.max(...rows.map((r) => r.year)) : null;
  const me = lastYear != null ? placeFor(brands, f, lastYear) : null;
  let map: React.ReactNode = null;
  let leaguePins: Pin[] | null = null;
  let clubCount = 0;
  if (lastYear != null && me && me.latitude != null && me.longitude != null) {
    const [clubs, places] = await Promise.all([getClubs(lg, lastYear), getSeasonAlignment(lg, lastYear)]);
    leaguePins = clubPins({ year: lastYear, me: f, clubs, brands, abbrs, alignment: places, places: venuePlaces, names: venueNames, facts: venueFacts, say, href: (c) => paths.team(lg, c) });
    clubCount = clubs.length;
    const mePlace = venuePlaces.get(placeKey(f, me.home_venue, me.latitude, me.longitude) ?? "");
    map = (
      <TeamMapCorner
        me={{ f, name: now, abbr: abbrFor(abbrs, f, lastYear, now), lat: me.latitude, lon: me.longitude, venue: me.home_venue ? nameIn(mePlace?.wid ? venueNames.get(mePlace.wid) : undefined, lastYear, me.home_venue) : me.home_venue, place: mePlace?.place, wiki: mePlace?.wiki, href: paths.team(lg, f), me: true }}
        others={leaguePins} clubCount={clubs.length}
        seasonLabel={seasonLabel(lg, lastYear)} leagueShort={LG[lg]} name={now}
      />
    );
  }

  const switchClubs = (await getLeagueClubs(lg).catch(() => [])).sort((a, c) => a.name.localeCompare(c.name, "en"));
  const withGames = new Set(summary.seasons.filter((x) => x.league === lg && x.games > 0).map((x) => x.year));
  const idle = idleYears(rows, summary.seasons, lg);
  // Seasons the club has but the standings do not (no regular-season games on file): the early Stanley Cup challengers played only a series, a few
  // clubs have a champion year with no games loaded, and a season not begun has nothing. Each is listed with what it is, so the page agrees with the city page.
  const haveRow = new Set(rows.map((r) => r.year));
  const pending = t.unrecorded.filter(([y, champion]) => !haveRow.has(y) && (withGames.has(y) || champion));
  const phases = await getTeamPhases(lg, f, pending.map(([y]) => y).join(","));
  const bare = new Map(pending.map(([year, , team]) => {
    const ph = phases.get(year);
    const kind = ph?.has("playoffs") && !ph.has("regular") ? (lg === "nhl" && year < 1926 ? "bareCup" : "barePlayoffs") : ph?.size ? "bareOther" : "bareNone";
    return [year, { team, label: say(`team.${kind}` as const) }] as const;
  }));
  for (const y of bare.keys()) idle.delete(y);
  const gaps: StandingRow[] = [...idle].filter(([y]) => !rows.some((r) => r.year === y)).map(([y]) => ({
    league: lg, year: y, team_id: 0, franchise_id: f, team: null, gp: null, w: null, l: null, t: null, otl: null, pts: null,
    pf: null, pa: null, home: null, road: null, pct: null, basis: "none", source: null,
  }));
  const bareRows: StandingRow[] = [...bare].map(([y, x]) => ({
    league: lg, year: y, team_id: 0, franchise_id: f, team: x.team, gp: null, w: null, l: null, t: null, otl: null, pts: null,
    pf: null, pa: null, home: null, road: null, pct: null, basis: "none", source: null,
  }));
  const tableRows = [...rows, ...gaps, ...bareRows].sort((a, b) => b.year - a.year);
  const standings = tableOf(tableRows, [
    {
      key: "champ", label: say("col.champion"), hideLabel: true, cls: "cupcol", title: say("team.champSeason"), get: (r) => (won.has(r.year) ? 1 : 0),
      cell: (r) => (won.has(r.year) ? <MiniCup league={lg} /> : null),
    },
    {
      key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (r) => r.year,
      cell: (r) => <Link href={seasonPath(lg, r.year)} prefetch={false}>{seasonLabel(lg, r.year)}</Link>,
    },
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => idle.has(r.year) ? <NoSeason kind={idle.get(r.year)} /> : <><TeamLogo url={logoFor(brands, f, r.year)} /><span className="tn-long">{r.team || ""}</span><abbr className="tn-short" title={r.team ?? undefined}>{abbrFor(abbrs, f, r.year, r.team)}</abbr>{bare.has(r.year) ? <span className="seasoncell barenote"> · {bare.get(r.year)?.label}</span> : null}</>,
    },
    {
      key: "gp", label: say("col.gp"), num: true, title: say("col.gpSeasonTitle"), get: (r) => r.gp,
      cell: (r) => (r.gp != null && withGames.has(r.year) ? (
        <Link href={paths.teamSeason(lg, f, r.year)} prefetch={false} title={say("team.everyGame", { season: seasonLabel(lg, r.year) })}>{r.gp}</Link>
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
  const venues = (brands[f] ?? [])
    .filter((v, i, all) => v.home_venue && all.findIndex((w) => w.home_venue === v.home_venue && w.brand_from === v.brand_from) === i)
    .sort((a, c) => (a.brand_from ?? "").localeCompare(c.brand_from ?? ""));
  // A venue that was renamed gets one row per name, each with the years that name applied inside the club's stay.
  const venueRows = venues.flatMap((v) => {
    const at = venuePlaces.get(placeKey(f, v.home_venue, v.latitude, v.longitude) ?? "");
    const spans = at?.wid ? venueNames.get(at.wid) : undefined;
    const fy = v.brand_from ? Number(v.brand_from.slice(0, 4)) : null, ty = v.brand_to ? Number(v.brand_to.slice(0, 4)) : null;
    const inside = (spans ?? []).filter((s) => (ty == null || s.from == null || s.from <= ty) && (fy == null || s.until == null || s.until >= fy));
    const facts = factsLine(at?.wid ? venueFacts.get(at.wid) : undefined, say);
    if (!inside.length) return [{ v, shown: v.home_venue!, from: v.brand_from, to: v.brand_to, now: null, facts }];
    return inside.map((s, i) => ({
      v, shown: s.name, from: i === 0 ? v.brand_from : String(s.from), to: i === inside.length - 1 ? v.brand_to : String(s.until),
      now: nowName(spans, s.name), facts: i === inside.length - 1 ? facts : null,
    }));
  });
  const venueTable = tableOf(venueRows, [
    {
      key: "venue", label: say("col.venue"), cls: "team", get: (r) => r.shown,
      cell: (r) => {
        const wiki = venuePlaces.get(placeKey(f, r.v.home_venue, r.v.latitude, r.v.longitude) ?? "")?.wiki;
        return <>
          {r.shown}
          {r.now ? <><br /><span className="seasoncell">{say("venues.now", { name: r.now })}</span></> : null}
          {wiki ? <><br /><a className="seasoncell" href={wiki} target="_blank" rel="noopener noreferrer">{say("venues.wikipedia")}</a></> : null}
          {r.facts ? <><br /><span className="note">{r.facts}</span></> : null}
        </>;
      },
    },
    { key: "from", label: say("col.from"), cls: "seasoncell", get: (r) => r.from, cell: (r) => r.from || "" },
    { key: "until", label: say("col.until"), cls: "seasoncell", get: (r) => r.to || "9999", cell: (r) => r.to || say("team.today") },
    {
      key: "location", label: say("col.location"), get: (r) => r.v.latitude,
      cell: (r) => {
        const v = r.v;
        if (v.latitude == null || v.longitude == null) return "";
        const at = venuePlaces.get(placeKey(f, v.home_venue, v.latitude, v.longitude) ?? "");
        const address = placeAddress(at, at?.wid ? venueFacts.get(at.wid) : undefined, v.latitude, v.longitude, say);
        const href = venueMapsUrl(address, v.latitude, v.longitude);
        const lines = address?.lines.map((l) => <Fragment key={l}>{l}<br /></Fragment>);
        return <>{href && address ? <AddressLink href={href} label={say("address.openMap", { address: address.text })}>{lines}</AddressLink> : lines}<span className="seasoncell">{`${Math.abs(v.latitude).toFixed(2)}°${v.latitude < 0 ? "S" : "N"} ${Math.abs(v.longitude).toFixed(2)}°${v.longitude < 0 ? "W" : "E"}`}</span></>;
      },
    },
  ], (r, i) => `${i}|${r.shown}`);
  const venueTeams = venues.length ? await getVenueTeams(lg, brands, paths, say) : [];
  const spOne = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const place = placeFor(brands, f, lastYear ?? undefined);
  const country = countryAt(place?.latitude, place?.longitude);
  const city = await getClubCity(lg, f);
  const titlesPart = nTitles ? say("team.titlesSuffix", { titles: plural("count.championships", nTitles) }) : "";
  const ledeText = !bare.size ? say("team.lede", { seasons: plural("count.seasons", t.seasons.length), titles: titlesPart })
    : t.seasons.length ? say("team.ledeBare", { seasons: plural("count.seasons", t.seasons.length), bare: plural("count.seasons", bare.size), titles: titlesPart })
      : say("team.ledeBareOnly", { seasons: plural("count.seasons", bare.size), titles: titlesPart });
  return (
    <>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      {b?.primary_hex ? (
        <div className="teamband" style={{ "--tp": `#${b.primary_hex}`, "--ts": `#${b.secondary_hex || b.primary_hex}` } as React.CSSProperties} />
      ) : null}
      <section className="head fade">
        <div className="headcorner">
          {map}
          <TeamSwitch current={paths.team(lg, f)} options={switchClubs.map((c) => ({ name: c.name, href: paths.team(lg, c.f) }))} />
        </div>
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link>{city ? <> · <Link className="citylink" href={`/city/${city.slug}`} prefetch={false} title={say("city.teamLink", { name: locale === "fr" && city.nameFr ? city.nameFr : city.name })}>{locale === "fr" && city.nameFr ? city.nameFr : city.name}</Link></> : null}</span>
        <h1 className="teamname"><TeamLogo url={logoFor(brands, f)} size={56} />{now}<Flag code={country} /></h1>
        {reigning && reigning.champion_franchise === f ? (
          <Link className="reigning" href={seasonPath(lg, reigning.year)}>
            <BadgeCup league={lg} />
            {streak > 1 ? say("team.reigningMany", { n: fmt(streak), season: reigning.label }) : say("team.reigning", { season: reigning.label })}
          </Link>
        ) : null}
        <p className="lede">{ledeText}</p>
        <CompareControl lg={lg} f={f} name={now} />
      </section>
      {rows.length ? <Lifetime lg={lg} f={f} rows={rows} /> : null}
      {nTitles ? (
        <div className="trophyrow fade">
          <div className="trophies"><b>{nTitles}</b>{nTitles > 1 && nTitles <= 5 ? <span className="cups">{[...cup.map((c) => c.year), ...t.titles].map((y) => <Trophy key={y} league={lg} className="cup" />)}</span> : <Trophy league={lg} className="cup" />}</div>
          <div className="champs">
            <h2>{say("team.championships")}</h2>
            <div className="seasonlist">
              {cup.map((c) => <span key={`cup${c.year}`} className="full" title={`${say("cup.name")} (${say("cup.before")}) · ${c.team}${c.league ? ` (${c.league})` : ""}`}>{c.year} {say("cup.name")}{c.league ? ` · ${c.league}` : ""}</span>)}
              {t.titles.map((y) => <Link key={y} className="full" href={seasonPath(lg, y)}><TeamLogo url={logoFor(brands, f, y)} size={16} />{seasonLabel(lg, y)}</Link>)}
            </div>
          </div>
        </div>
      ) : null}
      {rows.length ? (
        <TeamCharts lg={lg} f={f} rows={rows} titles={t.titles} seasons={t.seasons} idle={[...idle]} />
      ) : bare.size ? null : (
        <section className="section">
          <h2>{say("team.winTitle")}</h2>
          <p className="note">{say("team.winNote")}</p>
          <WinLine seasons={t.seasons} titles={t.titles} lg={lg} idle={[...idle]} />
        </section>
      )}
      {rows.length ? <Suspense fallback={null}><FranchiseCountries lg={lg} f={f} name={now} /></Suspense> : null}
      {rows.length || bare.size ? (
        <section className="section">
          <h2>{say("team.standings")}</h2>
          <p className="note">{say("team.standingsNote", { seasons: plural("count.seasons", rows.length + bare.size) })}</p>
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
      {venues.length ? (
        <section className="section">
          <h2>{say("team.venues")}</h2>
          {venueTeams.length ? (
            <VenueMap
              league={leaguePins} teams={venueTeams} slug={paths.slug(lg, f)} leagueShort={LG[lg]} seasonLabel={lastYear != null ? seasonLabel(lg, lastYear) : ""}
              clubCount={clubCount} tab={spOne("map") === "history" ? "history" : "league"} team={spOne("team") ?? paths.slug(lg, f)}
            />
          ) : null}
          <div className="scroll"><SortTable {...venueTable} param="sort_venues" /></div>
          <FranchiseVenueNotes lg={lg} f={f} />
          {venueTeams.length ? null : <p className="note"><Credits say={say} use={["addresses"]} /></p>}
        </section>
      ) : null}
      <p className="note"><Credits say={say} use={["flags"]} /></p>
    </>
  );
});
