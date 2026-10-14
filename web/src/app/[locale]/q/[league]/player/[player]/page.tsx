import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { BirthMap } from "@/components/BirthMap";
import { Credits } from "@/components/Credits";
import type { Pin } from "@/components/mapDraw";
import { Flag } from "@/components/Flag";
import { Rich } from "@/components/i18n/Rich";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import { logoFor } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { placeFor } from "@/lib/venue";
import { getPaths } from "@/lib/teamSlugs";
import { getBrands, getSummary } from "@/lib/data";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { PlayerResume } from "@/components/PlayerResume";
import { positionBook } from "@/components/PositionKey";
import { PlayerBoard } from "@/components/PlayerBoard";
import { getPerson, getPlayerRecord, getRedirect } from "@/lib/people";
import { buildBoard } from "@/lib/playerBoardData";
import { getPositions } from "@/lib/positionData";
import { positionCodes, positionNames } from "@/lib/positions";
import { ageOn, countryName, inches } from "@/lib/people-format";
import { tableOf } from "@/lib/sort";
import "@/components/people.css";
import { getPlayerPaths, homeLeague } from "@/lib/playerLinks";
import { playersNamed } from "@/lib/playerIndex";
import { playerIdOf, playerPath } from "@/lib/playerPath";
import { seasonPath, withQuery } from "@/lib/slug";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/[league]/player/[player] keeps this page and revalidates it every hour. The data behind it keeps its one-hour cache (lib/api/client.ts).

/** The person an address means and the address they should have; null when the league or the id is not one. */
async function locate(league: string, seg: string) {
  const id = playerIdOf(seg);
  if (!isLeague(league) || id == null) return null;
  const d = await getPerson(id);
  if (!d) return null;
  const home = (await homeLeague(d.person)) ?? league;
  return { d, home, path: playerPath(home, id, d.person.name), here: `/${league}/player/${seg}` };
}

export const generateMetadata = guardMeta(async ({ params }: PageProps<"/[locale]/q/[league]/player/[player]">): Promise<Metadata> => {
  const { league, player } = await params;
  const at = await locate(league, player);
  if (!at) return {};
  const { d } = at;
  const { say, plural, locale } = await currentSpeaker();
  const p = d.person;
  const bits = [positionNames(positionCodes(p.positions, p.position), at.home, await getPositions(), locale) || null, (p.leagues ?? []).map((l) => (isLeague(l) ? LG[l] : l)).join(", ") || null,
    p.award_count ? plural("count.awards", p.award_count) : null, p.championship_count ? plural("count.championships", p.championship_count) : null].filter(Boolean);
  const details = bits.length ? say("player.metaDetails", { list: bits.join(", ") }) : "";
  return pageMeta({ title: p.name, description: say("player.metaDesc", { name: p.name, details }), path: at.path, locale });
});

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pfact"><dt>{label}</dt><dd>{children}</dd></div>;
}

export default guard(async function PlayerPage({ params, searchParams }: PageProps<"/[locale]/q/[league]/player/[player]">) {
  const [{ league, player }, sp] = await Promise.all([params, searchParams]);
  const at = await locate(league, player);
  if (!at) {
    // An address with no id: the one player of that name, or a short list to choose from.
    const oldId = playerIdOf(player);
    if (!isLeague(league)) notFound();
    if (oldId != null) {
      // A record merged into another (db/build/185_person_merge.sql): the old address goes to the person who holds its data now.
      const kept = await getRedirect(oldId);
      const to = kept != null ? await locate(league, String(kept)) : null;
      if (!to) notFound();
      permanentRedirect(withQuery(to.path, sp));
    }
    const found = await playersNamed(player);
    if (!found.length) notFound();
    const url = await getPlayerPaths();
    if (found.length === 1) permanentRedirect(withQuery(url(found[0].person_id, found[0].name, found[0].leagues?.[0] ?? league), sp));
    const { say } = await currentSpeaker();
    const pickBook = await positionBook();
    return (
      <>
      <section className="head fade">
        <h1>{say("player.pickTitle", { name: found[0].name })}</h1>
        <p className="lede">{say("player.pickNote")}</p>
        <ul className="pick">
          {found.map((x) => (
            <li key={x.person_id}>
              <Link href={url(x.person_id, x.name, x.leagues?.[0] ?? league)} prefetch={false}>{x.name}</Link>
              {" · "}{(x.leagues ?? []).map((l) => (isLeague(l) ? LG[l] : l)).join(", ")}
              {x.positions?.length || x.position ? <>{" · "}{pickBook.list(x.positions, x.position, x.leagues ?? [])}</> : null}
              {x.first_season != null ? <>{" · "}{x.last_season != null && x.last_season !== x.first_season ? `${x.first_season}–${x.last_season}` : String(x.first_season)}</> : null}
            </li>
          ))}
        </ul>
      </section>
      {pickBook.key()}
      </>
    );
  }
  if (at.path !== at.here) permanentRedirect(withQuery(at.path, sp));
  const { d, home } = at;
  const { say, locale, dt, fmt } = await currentSpeaker();
  const [brands, summary, record] = await Promise.all([getBrands(), getSummary(), getPlayerRecord(d.person.person_id)]);
  const { person: p, awards, teams } = d;
  const lgs = (p.leagues ?? []).filter(isLeague);
  const paths = await getPaths();
  const homePin: Pin | null = p.birth_lat != null && p.birth_lon != null
    ? { f: 0, name: p.birth_place || say("player.birthplace"), venue: p.birth_place ? say("player.birthplace") : null, lat: p.birth_lat, lon: p.birth_lon, cc: countryAt(p.birth_lat, p.birth_lon), me: true }
    : null;
  const teamPins: Pin[] = [];
  for (const t of [...teams].reverse()) {
    const key = `${t.league}|${t.franchise_id}`;
    const b = placeFor(brands, t.franchise_id, t.to_year);
    if (!b || b.latitude == null || b.longitude == null || teamPins.some((x) => x.slug === key)) continue;
    teamPins.push({ f: teamPins.length + 1, slug: key, name: t.team || say("team.fallback", { id: t.franchise_id }), venue: b.home_venue, lat: b.latitude, lon: b.longitude, cc: countryAt(b.latitude, b.longitude), href: paths.team(t.league, t.franchise_id) });
  }
  const age = ageOn(p.birth_date, p.death_date);
  const yr = (s: string) => s.slice(0, 4);
  const longDate = (s: string) => dt.ymd(atUtc(s));
  const leagueName = (l: string) => (isLeague(l) ? LG[l] : l);

  // A title: a season in a run of seasons with a franchise in which that franchise was the league champion.
  const champ = new Map(summary.seasons.filter((s) => s.champion_franchise != null).map((s) => [`${s.league}|${s.year}`, s.champion_franchise]));
  const titles: { league: string; year: number; team: string | null }[] = [];
  for (const t of teams) for (let y = t.from_year; y <= t.to_year; y++) if (champ.get(`${t.league}|${y}`) === t.franchise_id) titles.push({ league: t.league, year: y, team: t.team });
  // Seasons known from statistics rather than rosters carry the title on the club-season itself.
  for (const s of record.seasonTeams) if (s.team_champion && !titles.some((t) => t.league === s.league && t.year === s.year)) titles.push({ league: s.league, year: s.year, team: s.team });
  titles.sort((a, b) => b.year - a.year);
  const seasonsHeld = new Set(summary.seasons.map((s) => `${s.league}|${s.year}`));
  const board = await buildBoard({ name: p.name, position: p.position, record, brands, titles, awards, held: seasonsHeld });

  const facts: ReactNode[] = [];
  if (p.birth_date || p.birth_place || p.birth_country_code) {
    facts.push(
      <Fact key="born" label={say("player.factBorn")}>
        {[p.birth_date ? longDate(p.birth_date) : null, p.birth_place].filter(Boolean).join(" · ")}
        {p.birth_country_code ? <>{p.birth_date || p.birth_place ? ", " : ""}<Flag code={p.birth_country_code} /> {countryName(p.birth_country_code, locale)}</> : null}
      </Fact>,
    );
  }
  if (p.death_date) facts.push(<Fact key="died" label={say("player.factDied")}>{longDate(p.death_date)}{age != null ? say("player.aged", { age }) : ""}</Fact>);
  else if (age != null) facts.push(<Fact key="age" label={say("player.factAge")}>{age}</Fact>);
  if (p.nationality_code && (p.nationality_code !== p.birth_country_code || !p.birth_country_code)) {
    facts.push(<Fact key="country" label={say("player.factCountry")}><Flag code={p.nationality_code} /> {countryName(p.nationality_code, locale)}</Fact>);
  }
  // The full names with the code beside each, linking to the key at the bottom; read in the page's league first, then the player's others.
  const book = await positionBook();
  if (positionCodes(p.positions, p.position).length) facts.push(<Fact key="pos" label={say("player.factPosition")}>{book.list(p.positions, p.position, [home, ...lgs], true)}</Fact>);
  if (p.height_cm) facts.push(<Fact key="h" label={say("player.factHeight")}>{`${p.height_cm} cm (${inches(p.height_cm)})`}</Fact>);
  if (p.hall_of_fame_year) facts.push(<Fact key="hof" label={say("player.factHof")}>{say("player.hofInducted", { year: p.hall_of_fame_year })}</Fact>);
  if (p.seasons_played && p.first_season != null && p.last_season != null) {
    const lg0 = teams[0]?.league ?? lgs[0] ?? "", lg1 = teams.at(-1)?.league ?? lg0;
    facts.push(
      <Fact key="sp" label={say("player.factSeasons")}>
        {p.last_season !== p.first_season
          ? say("player.seasonsSpan", { count: fmt(p.seasons_played), from: seasonLabel(lg0, p.first_season), to: seasonLabel(lg1, p.last_season) })
          : say("player.seasonsOne", { count: fmt(p.seasons_played), season: seasonLabel(lg0, p.first_season) })}
      </Fact>,
    );
  }
  if (p.championship_count) facts.push(<Fact key="ch" label={say("player.factTitles")}>{p.championship_count}</Fact>);
  if (p.award_count) facts.push(<Fact key="aw" label={say("player.factAwards")}>{p.award_count}</Fact>);

  const awardTable = tableOf(awards, [
    { key: "season", label: say("col.season"), num: true, get: (r) => r.year, cell: (r) => <Link href={seasonPath(r.league, r.year)} prefetch={false}>{`${leagueName(r.league)} ${seasonLabel(r.league, r.year)}`}</Link> },
    { key: "award", label: say("col.award"), cls: "team", get: (r) => r.award },
    { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team, cell: (r) => (r.team ? <TeamLabel lg={r.league} f={r.franchise_id} name={r.team} logo={logoFor(brands, r.franchise_id, r.year)} /> : "") },
    { key: "note", label: say("col.note"), cls: "note", get: (r) => r.note, cell: (r) => r.note || "" },
  ], (r, i) => `${r.award_code}|${r.year}|${i}`);
  const teamTable = tableOf(teams, [
    { key: "from", label: say("col.from"), num: true, get: (t) => t.from_year, cell: (t) => <Link href={seasonPath(t.league, t.from_year)} prefetch={false}>{seasonLabel(t.league, t.from_year)}</Link> },
    { key: "to", label: say("col.to"), num: true, get: (t) => t.to_year, cell: (t) => (t.to_year === t.from_year ? "" : <Link href={seasonPath(t.league, t.to_year)} prefetch={false}>{seasonLabel(t.league, t.to_year)}</Link>) },
    { key: "team", label: say("col.team"), cls: "team", get: (t) => t.team, cell: (t) => <TeamLabel lg={t.league} f={t.franchise_id} name={t.team || say("team.fallback", { id: t.franchise_id })} logo={logoFor(brands, t.franchise_id, t.to_year)} /> },
    { key: "league", label: say("col.league"), get: (t) => leagueName(t.league) },
  ], (t) => `${t.league}|${t.franchise_id}|${t.from_year}`);

  return (
    <>
      {isLeague(home) ? <AccentStyle league={home} /> : null}
      <section className="head fade">
        {homePin ? <BirthMap home={homePin} pins={[homePin, ...teamPins]} name={p.name} /> : null}
        <span className="eyebrow">{lgs.length ? lgs.map((l) => LG[l]).join(" · ") : say("player.eyebrow")}</span>
        <h1>{p.name}</h1>
        {p.birth_date ? <p className="lede">{p.death_date ? say("player.lifespan", { from: yr(p.birth_date), to: yr(p.death_date) }) : say("player.bornYear", { year: yr(p.birth_date) })}</p> : null}
      </section>
      {facts.length ? <dl className="pfacts">{facts}</dl> : <p className="note">{say("player.noBio")}</p>}
      {titles.length ? (
        <section className="section">
          <h2>{say("player.titles", { count: fmt(titles.length) })}</h2>
          <div className="seasonlist">
            {titles.map((t) => (
              <Link key={`${t.league}${t.year}`} className="full" href={seasonPath(t.league, t.year)} prefetch={false} title={say("player.titleTip", { team: t.team ?? "", league: leagueName(t.league) })}>
                {`${leagueName(t.league)} ${seasonLabel(t.league, t.year)}`}
              </Link>
            ))}
          </div>
          <p className="note">{say("player.titlesNote")}</p>
        </section>
      ) : null}
      {board ? <PlayerBoard data={board} /> : null}
      <PlayerResume resume={record.resume} seasons={record.seasonTeams} brands={brands} />
      {awards.length ? (
        <section className="section">
          <h2>{say("player.awards")}</h2>
          <div className="tablebox"><SortTable {...awardTable} param="sort_awards" def="season.desc" /></div>
        </section>
      ) : null}
      {teams.length ? (
        <section className="section">
          <h2>{say("player.teams")}</h2>
          <div className="tablebox"><SortTable {...teamTable} param="sort_teams" def="from.asc" /></div>
        </section>
      ) : null}
      {book.key()}
      <p className="note">
        <Rich text={say("player.credit")} parts={{
          wikidata: <a href="https://www.wikidata.org">Wikidata</a>,
          credits: <Credits say={say} use={["flags", "maps"]} />,
        }} />
      </p>
    </>
  );
});
