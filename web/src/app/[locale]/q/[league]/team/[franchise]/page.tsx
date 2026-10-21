import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { CompareControl } from "@/components/CompareControl";
import { SortTable } from "@/components/SortTable";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamAlignment } from "@/components/TeamAlignment";
import { TeamAwards } from "@/components/TeamAwards";
import { TeamCup } from "@/components/TeamCup";
import { TeamOtherSeasons } from "@/components/TeamOtherSeasons";
import { RetiredBanners } from "@/components/RetiredBanners";
import { TitleBanners } from "@/components/TitleBanners";
import { FranchiseCountries } from "@/components/FranchiseCountries";
import { TeamChartsLazy } from "@/components/TeamChartsLazy";
import { OpponentHeatLazy } from "@/components/OpponentHeatLazy";
import { ResultHeatLazy } from "@/components/ResultHeatLazy";
import { Credits } from "@/components/Credits";
import { AddressLink } from "@/components/AddressLink";
import { venueMapsUrl } from "@/lib/venueAddress";
import { Flag } from "@/components/Flag";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamMapCorner } from "@/components/TeamMap";
import { FranchiseVenueNotes } from "@/components/FranchiseVenueNotes";
import { VenueMapLazy } from "@/components/VenueMapLazy";
import { BadgeCup, BigTrophy } from "@/components/TrophyMark";
import { CupsProvider } from "@/components/TrophyIcon";
import { cupsFor } from "@/lib/cups";
import { Figures } from "@/components/ui";
import { WinLine } from "@/components/WinLine";
import type { StandingRow } from "@/lib/api/types";
import { abbrFor } from "@/lib/abbr";
import { brandFor, logoFor, teamAccent } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { placeFor } from "@/lib/venue";
import { titleHolders, titleStreak } from "@/lib/champions";
import { getOutageYears } from "@/lib/outageData";
import { getAbbrs, getBrands, getSummary, getTeam, getTeamStandings, type TeamData } from "@/lib/data";
import { fmt3 } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, PARENT, RELATED_LEAGUES, seasonLabel, topLeague, type LeagueCode } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { getTeamAwards } from "@/lib/people";
import { seasonPath } from "@/lib/slug";
import { getLeagueClubs, getPaths, teamOf } from "@/lib/teamSlugs";
import { TeamSwitch } from "@/components/TeamSwitch";
import { getClubCity } from "@/lib/cityData";
import { cupTitlesOf } from "@/lib/cup";
import { getCupTitles } from "@/lib/cupData";
import { getCupHistory } from "@/lib/cupHistory";
import { cupAppearances } from "@/lib/cupRows";
import "@/components/city.css";
import { mapRestPath } from "@/lib/mapView";
import { getVenuePlaces, placeKey } from "@/lib/venuePlace";
import { factsLine, getVenueFacts, getVenueNames, nameIn, nowName, placeAddress } from "@/lib/venueName";
import { nameEras, type NameSpan } from "@/lib/nameEras";
import { tableOf } from "@/lib/sort";
import { guard, guardMeta } from "@/lib/loadGuard";
import { franchiseSeasonRows, standLines } from "@/lib/franchiseRows";
import { STAND_HEAD } from "@/lib/standLines";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/[league]/team/[franchise] keeps this page and revalidates it every day. The data behind it keeps its one-day cache (lib/api/client.ts).

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
  // A club that is gone ends its final name with its last season rather than "today". `span` holds the days the name covers for counting
  // its seasons (the last season counts, so those run to the next 1 January).
  const gone = seasonYears.length > 0 && Math.max(...seasonYears) < latestYear;
  const names: (NameSpan & { span?: NameSpan })[] = t.names.map((n, i) => {
    if (n.from == null && n.to == null && gone) {
      const from = String(Math.min(...seasonYears)), to = String(Math.max(...seasonYears));
      return { ...n, from, to, span: { name: n.name, from, to: String(Number(to) + 1) } };
    }
    return gone && n.to == null && i === t.names.length - 1 ? { ...n, to: String(Math.max(...seasonYears)), span: n } : n;
  });
  const now = names.at(-1)?.name || say("team.fallback", { id: f });
  const b = brandFor(brands, f);
  const holders = titleHolders(summary.seasons, lg, outageYears);
  const reigning = holders.reigning;
  const streak = reigning && reigning.champion_franchise === f ? titleStreak(holders.byYear, f, reigning.year, holders.sat) : 0;
  const won = new Set(t.titles);

  // The corner map: the team's home in the latest season it has results for; the dialog shows every team that season.
  const lastYear = rows.length ? Math.max(...rows.map((r) => r.year)) : null;
  const me = lastYear != null ? placeFor(brands, f, lastYear) : null;
  let map: React.ReactNode = null;
  if (lastYear != null && me && me.latitude != null && me.longitude != null) {
    const mePlace = venuePlaces.get(placeKey(f, me.home_venue, me.latitude, me.longitude) ?? "");
    map = (
      <TeamMapCorner
        me={{ f, name: now, abbr: abbrFor(abbrs, f, lastYear, now), lat: me.latitude, lon: me.longitude, venue: me.home_venue ? nameIn(mePlace?.wid ? venueNames.get(mePlace.wid) : undefined, lastYear, me.home_venue) : me.home_venue, place: mePlace?.place, wiki: mePlace?.wiki, href: paths.team(lg, f), me: true }}
        dataHref={mapRestPath(at.path)}
        seasonLabel={seasonLabel(lg, lastYear)} leagueShort={LG[lg]} name={now}
      />
    );
  }

  const switchClubs = (await getLeagueClubs(lg).catch(() => [])).sort((a, c) => a.name.localeCompare(c.name, "en"));
  const { withGames, idle, bare, tableRows } = await franchiseSeasonRows(lg, f, t, rows, summary.seasons, say);
  const { lines: standLinesAll, flags: standFlags } = standLines(f, tableRows, won, idle, bare, withGames, brands, abbrs, rows);
  // Each name with the seasons played under it and its logo (the club's current one, drawn dimmed, where we hold none for those years).
  // The seasons the club played in the other leagues of its family count for its names too, so a name worn in one league only still shows its seasons.
  const others = (await Promise.all((RELATED_LEAGUES[lg] ?? []).map(async (o) => {
    const [ot, orows] = await Promise.all([getTeam(o, f).catch(() => null), getTeamStandings(o, f).catch(() => [] as StandingRow[])]);
    // (seasons with a record only: a club that met the NHL's in a Stanley Cup final has bare NHL seasons for it, and was no NHL club)
    return ot && orows.length ? { lg: o, seasons: orows.length, t: ot, rows: orows } : null;
  }))).filter((x): x is { lg: LeagueCode; seasons: number; t: TeamData; rows: StandingRow[] } => x !== null);
  const eras = nameEras(names.map((n) => n.span ?? n), [...new Set([...rows.map((r) => r.year), ...bare.keys(), ...others.flatMap((o) => o.rows.map((r) => r.year))])], brands, f).map((e, i) => ({ ...e, from: names[i].from, to: names[i].to }));
  const nameTable = tableOf(eras, [
    {
      key: "name", label: say("col.name"), cls: "team", get: (n) => n.name,
      cell: (n) => <><TeamLogo url={n.logo} dim={n.current} title={n.current ? say("team.currentLogo") : undefined} />{n.name}</>,
    },
    { key: "from", label: say("col.from"), cls: "seasoncell", get: (n) => n.from, cell: (n) => n.from || "" },
    { key: "until", label: say("col.until"), cls: "seasoncell", get: (n) => n.to || "9999", cell: (n) => n.to || say("team.today") },
    { key: "seasons", label: say("col.seasons"), num: true, get: (n) => n.seasons },
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
  const spOne = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const place = placeFor(brands, f, lastYear ?? undefined);
  const country = countryAt(place?.latitude, place?.longitude);
  const city = await getClubCity(lg, f);
  const titlesPart = nTitles ? say("team.titlesSuffix", { titles: plural("count.championships", nTitles) }) : "";
  // A rival league's clubs are today's franchises (the AFL's and the AAFC's, now NFL clubs): each league's page points to the same club's seasons in the others (`others`, above).
  const cupList = topLeague(lg) === "nhl" ? await getCupHistory().then((h) => cupAppearances(f, h.series, h.finals, h.games)) : [];
  // A Cup played in the spring of a year belongs to the season that began the year before: the club's page for it, in whichever league it played that season (one with a record first).
  const family = [{ lg, t, rows }, ...others];
  const cupSeasonHref = (year: number) => {
    const found = family.find((x) => x.rows.some((r) => r.year === year - 1)) ?? family.find((x) => x.t.unrecorded.some((u) => u[0] === year - 1));
    return found ? paths.teamSeason(found.lg, f, year - 1) : null;
  };
  // (a season with published standings and no games, the WCHL's, has a record row but none in t.seasons, which is worked out from the games)
  const recorded = new Set([...t.seasons.map((x) => x[0]), ...rows.map((r) => r.year)]).size;
  const ledeText = !bare.size ? say("team.lede", { seasons: plural("count.seasons", recorded), titles: titlesPart })
    : recorded ? say("team.ledeBare", { seasons: plural("count.seasons", recorded), bare: plural("count.seasons", bare.size), titles: titlesPart })
      : say("team.ledeBareOnly", { seasons: plural("count.seasons", bare.size), titles: titlesPart });
  return (
    <CupsProvider markup={cupsFor(won.size ? [lg] : [])}>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      {b?.primary_hex ? (
        <div className="teamband" style={{ "--tp": `#${b.primary_hex}`, "--ts": `#${b.secondary_hex || b.primary_hex}` } as React.CSSProperties} />
      ) : null}
      <section className="head fade">
        <div className="headcorner">
          {map}
          <TeamSwitch current={paths.team(lg, f)} options={switchClubs.map((c) => ({ name: c.name, href: paths.team(lg, c.f) }))} />
        </div>
        <span className="eyebrow">{PARENT[lg] ? <><Link href={`/${PARENT[lg]}`}>{LG[PARENT[lg]!]}</Link> › </> : null}<Link href={`/${lg}`}>{LG[lg]}</Link>{city ? <> · <Link className="citylink" href={`/city/${city.slug}`} prefetch={false} title={say("city.teamLink", { name: locale === "fr" && city.nameFr ? city.nameFr : city.name })}>{locale === "fr" && city.nameFr ? city.nameFr : city.name}</Link></> : null}</span>
        <h1 className="teamname"><TeamLogo url={logoFor(brands, f)} size={56} />{now}<Flag code={country} /></h1>
        {reigning && reigning.champion_franchise === f ? (
          <Link className="reigning" href={seasonPath(lg, reigning.year)}>
            <BadgeCup league={lg} />
            {streak > 1 ? say("team.reigningMany", { n: fmt(streak), season: reigning.label }) : say("team.reigning", { season: reigning.label })}
          </Link>
        ) : null}
        <p className="lede">{ledeText}</p>
        {others.map((o) => (
          <p className="note" key={o.lg}>{say("team.otherLeague", { league: LG[o.lg], seasons: plural("count.seasons", o.seasons) })} <Link href={paths.team(o.lg, f)}>{say("team.otherLeagueLink", { league: LG[o.lg] })}</Link></p>
        ))}
        {rows.length ? <CompareControl lg={lg} f={f} name={now} teamPath={at.path} /> : null}
      </section>
      {rows.length ? <Lifetime lg={lg} f={f} rows={rows} /> : null}
      {rows.length ? (
        <section className="section">
          <h2>{say("rheat.title")}</h2>
          <p className="note">{say("rheat.lede")}</p>
          <ResultHeatLazy teamPath={at.path} lg={lg} />
        </section>
      ) : null}
      {nTitles ? (
        <div className="trophyrow fade">
          <div className="trophies"><b>{nTitles}</b>{nTitles > 1 && nTitles <= 5 ? <span className="cups">{[...cup.map((c) => c.year), ...t.titles].map((y) => <BigTrophy key={y} league={lg} className="cup" />)}</span> : <BigTrophy league={lg} className="cup" />}</div>
          <div className="champs">
            <h2>{say("team.championships")}</h2>
            <div className="seasonlist">
              {cup.map((c) => <span key={`cup${c.year}`} className="full" title={`${say("cup.name")} (${say("cup.before")}) · ${c.team}${c.league ? ` (${c.league})` : ""}`}>{c.year} {say("cup.name")}{c.league ? ` · ${c.league}` : ""}</span>)}
              {t.titles.map((y) => <Link key={y} className="full" href={seasonPath(lg, y)}><TeamLogo url={logoFor(brands, f, y)} size={16} />{seasonLabel(lg, y)}</Link>)}
            </div>
            <TitleBanners lg={lg} f={f} name={now} />
          </div>
        </div>
      ) : null}
      <RetiredBanners lg={lg} f={f} name={now} />
      {rows.length ? (
        <TeamChartsLazy lg={lg} f={f} rows={rows.map(({ year, gp, w, l, t, otl, pf, pa, home, road }) => ({ year, gp, w, l, t, otl, pf, pa, home, road }))} titles={t.titles} seasons={t.seasons} idle={[...idle]} />
      ) : bare.size ? null : (
        <section className="section">
          <h2>{say("team.winTitle")}</h2>
          <p className="note">{say("team.winNote")}</p>
          <WinLine seasons={t.seasons} titles={t.titles} lg={lg} idle={[...idle]} />
        </section>
      )}
      {rows.length ? <Suspense fallback={null}><FranchiseCountries lg={lg} f={f} name={now} teamPath={at.path} /></Suspense> : null}
      {rows.length ? (
        <section className="section">
          <h2>{say("opheat.title")}</h2>
          <p className="note">{say("opheat.lede", { name: now })}</p>
          <OpponentHeatLazy teamPath={at.path} />
        </section>
      ) : null}
      {rows.length || bare.size ? (
        <section className="section">
          <h2>{say("team.standings")}</h2>
          <p className="note">{say("team.standingsNote", { seasons: plural("count.seasons", rows.length + bare.size) })}</p>
          <div className="tablebox"><StandingsTable lg={lg} f={f} teamPath={at.path} head={standLinesAll.slice(0, STAND_HEAD)} total={standLinesAll.length} flags={standFlags} /></div>
        </section>
      ) : null}
      {others.map((o) => (
        <TeamOtherSeasons key={o.lg} league={o.lg} f={f} rows={o.rows} titles={new Set(o.t.titles)} brands={brands} href={(y) => paths.teamSeason(o.lg, f, y)} />
      ))}
      {cupList.length ? <TeamCup appearances={cupList} seasonHref={cupSeasonHref} /> : null}
      <TeamAwards lg={lg} f={f} teamPath={at.path} />
      <TeamAlignment lg={lg} f={f} />
      {names.length ? (
        <section className="section">
          <h2>{say("team.names")}</h2>
          <div className="scroll"><SortTable {...nameTable} param="sort_names" /></div>
        </section>
      ) : null}
      {venues.length ? (
        <section className="section">
          <h2>{say("team.venues")}</h2>
          <VenueMapLazy teamPath={at.path} slug={paths.slug(lg, f)} tab={spOne("map") === "history" ? "history" : "league"} team={spOne("team") ?? paths.slug(lg, f)} />
          <div className="scroll"><SortTable {...venueTable} param="sort_venues" /></div>
          <FranchiseVenueNotes lg={lg} f={f} />
        </section>
      ) : null}
      <p className="note"><Credits say={say} use={eras.some((e) => e.logo?.startsWith("/team-logos/")) ? ["flags", "logos"] : ["flags"]} /></p>
    </CupsProvider>
  );
});
