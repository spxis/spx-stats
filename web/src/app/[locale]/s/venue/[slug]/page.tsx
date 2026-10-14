import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AddressLink } from "@/components/AddressLink";
import { Credits, LibCredit } from "@/components/Credits";
import { Flag } from "@/components/Flag";
import { Rich } from "@/components/i18n/Rich";
import { MapViewer } from "@/components/MapViewer";
import type { Pin } from "@/components/mapDraw";
import { SoccerFlag } from "@/components/SoccerFlag";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { PitchFigure, SoccerHere } from "@/components/VenueSoccer";
import { VisitControl } from "@/components/VenueVisits";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUE_CODES, LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName, joinList } from "@/lib/people-format";
import { tableOf } from "@/lib/sort";
import { pitchDrawing, surfacesFor } from "@/lib/venueDraw";
import { getVenueGames } from "@/lib/venueHome";
import { getNames } from "@/lib/venueMap";
import { findVenue, getVenueIndex } from "@/lib/venuePage";
import { getVenueMatches } from "@/lib/venueSoccer";
import { summarizeGames } from "@/lib/venueSoccerGames";
import { isSoccerLeague, matchCount, SOCCER_NAME_KEY, yearsOf } from "@/lib/venueSoccerRows";
import "@/components/city.css";
import "@/components/venue.css";

// Nothing is drawn at build time: each venue is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

const ROOF_KEY = { open: "venuesPage.roofOpen", dome: "venuesPage.roofDome", retractable: "venuesPage.roofRetractable" } as const;
const link = (href: string, text: string) => <a className="ext" href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/s/venue/[slug]">): Promise<Metadata> => {
  const { slug } = await params;
  const { say, plural, locale } = await currentSpeaker();
  const { venue } = findVenue(await getVenueIndex(), slug);
  if (!venue) return {};
  const { row } = venue;
  return pageMeta({
    title: row.place ? `${row.name}, ${row.place}` : row.name,
    description: row.kind === "soccer" ? say("venue.metaDescSoccer", { name: row.name }) : say("venue.metaDesc", { name: row.name, clubs: plural("count.clubs", row.clubs.length) }),
    path: `/venue/${row.slug}`,
    locale,
  });
});

export default guard(async function VenuePage({ params }: PageProps<"/[locale]/s/venue/[slug]">) {
  const { slug } = await params;
  const { say, plural, fmt, locale } = await currentSpeaker();
  const { venue, redirect } = findVenue(await getVenueIndex(), slug);
  if (!venue) notFound();
  // A Wikidata id is an address too (so another page can link a venue it knows only by that): it goes to the venue's own.
  if (redirect) permanentRedirect(`/venue/${redirect}`);
  const { row: v, detail, soccer } = venue;
  const today = say("team.today");
  const span = (a: number | null, b: number | null) => `${a ?? "…"}–${b ?? today}`;
  const leagueName = (l: string) => (isSoccerLeague(l) ? say(SOCCER_NAME_KEY[l]) : (LG as Record<string, string>)[l] ?? l.toUpperCase());
  const language = locale === "ja" ? "ja" : "en";
  const surfaces = surfacesFor(v, detail, language);
  // A world soccer stadium (a home venue's too): the World Cup and MLS matches played there, and its pitch drawn at its size. The clubs of a stadium that is only that are its competitions: no club table.
  const soccerOnly = v.kind === "soccer";
  const played = soccer ? summarizeGames(await getVenueMatches(soccer.venueId)) : null;
  const pitch = soccer ? pitchDrawing(soccer.pitch.length, soccer.pitch.width, language) : null;
  const matches = soccer ? matchCount(soccer) : 0;
  const soccerYears = soccer ? yearsOf(soccer) : { first: null, last: null };

  // The games played here (counts by league and season, the latest finals): read in one request, empty while the views are not on the server.
  const held = detail.wid && !soccerOnly ? await getVenueGames(detail.wid, [...v.leagues, ...LEAGUE_CODES]) : null;
  const names = new Map<string, string>();
  if (held?.finals.length) {
    await Promise.all([...new Set(held.finals.map((g) => g.league))].map(async (lg) => { for (const n of await getNames(lg)) names.set(`${lg}|${n.franchise_id}`, n.name); }));
  }
  const yearOf = (d: string) => Number(d.slice(0, 4));
  const gamesTable = held ? tableOf(held.games.leagues, [
    { key: "league", label: say("col.league"), get: (l) => leagueName(l.league) },
    { key: "seasons", label: say("venue.colSeasons"), num: true, get: (l) => l.seasons.length },
    { key: "games", label: say("venuesPage.colGames"), num: true, get: (l) => l.games, cell: (l) => fmt(l.games) },
    { key: "regular", label: say("venue.colRegular"), num: true, get: (l) => l.regular, cell: (l) => fmt(l.regular) },
    { key: "playoffs", label: say("venue.colPlayoffs"), num: true, get: (l) => l.playoffs, cell: (l) => fmt(l.playoffs) },
    { key: "finals", label: say("venue.colFinals"), num: true, get: (l) => l.finals, cell: (l) => fmt(l.finals) },
    { key: "first", label: say("venue.colFirstGame"), get: (l) => l.firstDate },
    { key: "last", label: say("venue.colLastGame"), get: (l) => l.lastDate },
  ], (l) => l.league) : null;

  const built = tableOf(v.clubs, [
    { key: "club", label: say("col.team"), cls: "team", get: (c) => c.name, cell: (c) => <TeamLabel lg={c.lg} f={c.f} name={c.name} logo={c.logo} /> },
    { key: "league", label: say("col.league"), get: (c) => leagueName(c.lg) },
    { key: "years", label: say("venue.colYears"), cls: "seasoncell", get: (c) => c.from ?? -1, cell: (c) => span(c.from, c.to) },
  ], (c) => `${c.lg}-${c.f}`);
  const rows = built.rows.map((r, i) => ({ ...r, group: v.clubs[i].to == null ? "active" : "former" }));

  const pin: Pin = {
    f: 0, name: v.name, lat: v.lat, lon: v.lon, cc: v.cc, wiki: v.wiki, place: v.place, defunct: !v.current,
    team: v.clubs.map((c) => c.name).slice(0, 4).join(", "), teamHref: v.clubs.length === 1 ? v.clubs[0].href : undefined,
    venue: `${v.leagues.map(leagueName).join(" · ")} · ${v.current ? span(v.from, null) : span(v.from, v.to)}`,
    extra: v.extra, address: v.address, addressHref: v.addressHref,
  };

  const formerNames = detail.names.length > 1 ? detail.names : [];
  const facts: [string, React.ReactNode][] = [
    [say("venuesPage.colCapacity"), v.capacity == null ? null : fmt(v.capacity)],
    [say("venuesPage.colOpened"), v.opened],
    [say("venuesPage.colClosed"), v.closed],
    [say("venuesPage.colRoof"), v.roof && v.roof in ROOF_KEY ? say(ROOF_KEY[v.roof as keyof typeof ROOF_KEY]) : v.roof],
    [say("venuesPage.colSurface"), v.surface],
    [say("venue.owner"), v.owner],
    [say("venue.address"), v.address ? (v.addressHref ? <AddressLink href={v.addressHref} label={say("address.openMap", { address: v.address })}>{v.address}</AddressLink> : v.address) : null],
    [say("venues.wikipedia"), v.wiki ? link(v.wiki, say("map.wikiOpens", { venue: v.name })) : null],
    ["Wikidata", detail.wid ? link(`https://www.wikidata.org/wiki/${detail.wid}`, detail.wid) : null],
  ];
  const shown = facts.filter((f): f is [string, React.ReactNode] => f[1] != null && f[1] !== "");

  return (
    <>
      <section className="head fade cityhead">
        <span className="eyebrow">
          <Link href="/venues">{say("venuesPage.title")}</Link>
          {v.place ? <> · {v.citySlug ? <Link href={`/city/${v.citySlug}`} prefetch={false}>{v.place}</Link> : v.place}</> : null}
          {v.cc ? <> · {countryName(v.cc, locale)}</> : null}
        </span>
        <h1 className="cityname">{v.name}{v.cc ? (soccer ? <SoccerFlag code={v.cc} name={countryName(v.cc, locale)} shape="rect" /> : <Flag code={v.cc} />) : null}</h1>
        <p className="lede">
          {soccerOnly
            ? say(v.place ? "venue.ledeSoccer" : "venue.ledeSoccerNoPlace", { name: v.name, place: v.place ?? "", matches: plural("count.matches", matches), competitions: joinList(v.leagues.map(leagueName), locale) })
            : say(v.place ? "venue.lede" : "venue.ledeNoPlace", { name: v.name, place: v.place ?? "", clubs: plural("count.clubs", v.clubs.length), leagues: v.leagues.map(leagueName).join(", ") })}
          {!soccerOnly && soccer && matches ? <>{" "}{say("venue.ledeAlsoSoccer", { matches: plural("count.matches", matches) })}</> : null}
        </p>
        <VisitControl vkey={v.key} name={v.name} always />
      </section>

      <Figures items={soccerOnly ? [
        [say("venue.figMatches"), matches],
        [say("venuesPage.colLeagues"), v.leagues.length],
        [say("venue.figFirst"), soccerYears.first == null ? "—" : String(soccerYears.first)],
        [say("venue.figLast"), v.current ? today : soccerYears.last == null ? "—" : String(soccerYears.last)],
        ...(v.capacity != null ? [[say("venuesPage.colCapacity"), fmt(v.capacity)] as [string, string]] : []),
      ] : [
        [say("city.figClubs"), v.clubs.length],
        [say("venuesPage.colLeagues"), v.leagues.length],
        [say("venue.figFirst"), v.from == null ? "—" : String(v.from)],
        [say("venue.figLast"), v.current ? today : v.to == null ? "—" : String(v.to)],
        ...(held ? [[say("venue.figGames"), held.games.games] as [string, number]] : []),
        ...(soccer && matches ? [[say("venue.figMatches"), matches] as [string, number]] : []),
      ]} />

      {soccerOnly ? null : (
        <section className="section">
          <h2>{say("venue.clubsHead")}</h2>
          <div className="scroll cityclubs">
            <SortTable columns={built.columns} rows={rows} def="years.asc" label={say("venue.clubsHead")} groups={[{ id: "active", title: say("venue.groupNow") }, { id: "former", title: say("venue.groupFormer") }]} />
          </div>
          <p className="note">{say("venue.clubsNote")}</p>
        </section>
      )}

      {formerNames.length ? (
        <section className="section">
          <h2>{say("venue.namesHead")}</h2>
          <ul className="venuenameslist">
            {formerNames.map((n, i) => (
              <li key={`${n.name}-${n.from}`}><b>{n.name}</b><span>{span(n.from, n.until ?? (i === formerNames.length - 1 && v.current ? null : n.until))}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {held && gamesTable ? (
        <section className="section">
          <h2>{say("venue.gamesHead")}</h2>
          <p className="note">{say("venue.gamesLede", { games: plural("count.games", held.games.games), first: String(yearOf(held.games.firstDate)), last: String(yearOf(held.games.lastDate)) })}</p>
          <div className="scroll venuegames">
            <SortTable columns={gamesTable.columns} rows={gamesTable.rows} def="games.desc" label={say("venue.gamesHead")} />
          </div>
          <details className="venueseasons">
            <summary>{say("venue.seasonsHead")}</summary>
            {held.games.leagues.map((l) => (
              <div key={l.league}>
                {held.games.leagues.length > 1 ? <h3>{leagueName(l.league)}</h3> : null}
                <p>{l.seasons.map((x) => `${x.year} (${x.games})`).join(", ")}</p>
              </div>
            ))}
          </details>
          {held.finals.length ? (
            <>
              <h3>{say("venue.finalsHead")}</h3>
              <ul className="venuefinals">
                {held.finals.map((g) => {
                  const home = names.get(`${g.league}|${g.home_franchise_id}`) ?? "", away = names.get(`${g.league}|${g.away_franchise_id}`) ?? "";
                  return (
                    <li key={g.game_id}>
                      <Link href={`/${g.league}/scores/${g.game_date}`} prefetch={false}>{g.game_date}</Link>
                      <span>{`${leagueName(g.league)} ${g.year}`}</span>
                      <span>{g.away_score != null && g.home_score != null ? `${away} ${g.away_score}, ${home} ${g.home_score}` : `${away} / ${home}`}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="note">{say("venue.finalsNote", { n: fmt(held.games.finals) })}</p>
            </>
          ) : null}
          <p className="note">{say("venue.gamesNote")}</p>
        </section>
      ) : null}

      {played ? <SoccerHere games={played} say={say} plural={plural} fmt={fmt} locale={locale} /> : null}

      {soccer && pitch ? <PitchFigure pitch={soccer.pitch} drawing={pitch} say={say} /> : null}

      {surfaces.length ? (
        <section className="section">
          <h2>{say("venue.surfaceHead")}</h2>
          <div className="venuesurfaces">
            {surfaces.map((s) => (
              <figure key={s.sport} className="venuesurface">
                {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG file, not a photo: next/image has nothing to resize */}
                <img src={s.src} alt={s.alt} width={s.width} height={s.height} loading="lazy" decoding="async" />
                <figcaption className="note">
                  {s.parkName ? say("venue.surfacePark", { league: leagueName(s.sport), park: s.parkName }) : say("venue.surfaceStd", { league: leagueName(s.sport) })}
                  {s.year != null ? <>{" "}{say("venue.surfaceYear", { year: s.year })}</> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>{say("venue.factsHead")}</h2>
        {shown.length ? (
          <dl className="venuefacts">
            {shown.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{typeof val === "number" ? String(val) : val}</dd></div>)}
          </dl>
        ) : null}
        <MapViewer tight lone pins={[pin]} title={say("venue.mapTitle", { name: v.name })} total={1} note={say("venue.mapNote")} />
      </section>

      <p className="note">
        <Credits say={say} use={["flags"]} />{" "}
        {surfaces.length || pitch ? <Rich text={say("credit.surfaces")} parts={{ kyogijo: <LibCredit lib="kyogijo" /> }} /> : null}{" "}
        {say(soccer ? "venue.dataCreditSoccer" : "venue.dataCredit")}
      </p>
    </>
  );
});
