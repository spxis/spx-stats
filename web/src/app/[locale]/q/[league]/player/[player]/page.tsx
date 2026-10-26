import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { BirthMap } from "@/components/BirthMap";
import { Credits } from "@/components/Credits";
import type { Pin } from "@/components/mapDraw";
import { Flag } from "@/components/Flag";
import { Rich } from "@/components/i18n/Rich";
import { SortTable } from "@/components/SortTable";
import { eventName, roleWord } from "@/components/AllStar";
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
import { PlayerTitles } from "@/components/PlayerTitles";
import { positionBook } from "@/components/PositionKey";
import { PlayerBoard } from "@/components/PlayerBoard";
import { PlayerCompare } from "@/components/PlayerCompare";
import { CupsProvider } from "@/components/TrophyIcon";
import { cupsFor } from "@/lib/cups";
import { getPersonRetired } from "@/lib/retiredNumbers";
import { PlayerRetired } from "@/components/PlayerRetired";
import { getPerson, getPlayerRecord, getRedirect } from "@/lib/people";
import { trophyPath } from "@/lib/awardTrophy";
import { COACH_AWARDS, getPersonCoaching, getPersonStaff } from "@/lib/personCoaching";
import { recordText } from "@/lib/record";
import { buildBoard, careerTitles } from "@/lib/playerBoardData";
import { getPositions } from "@/lib/positionData";
import { positionCodes, positionNames } from "@/lib/positions";
import { ageOn, countryName, inches } from "@/lib/people-format";
import { tableOf } from "@/lib/sort";
import "@/components/people.css";
import { getPlayerPaths, homeLeague } from "@/lib/playerLinks";
import { getAllStar, getClubs, getPersonAllStar } from "@/lib/allStar";
import { allStarPath, type PersonAllStar } from "@/lib/allStarView";
import { orElse } from "@/lib/api/soften";
import { playersNamed } from "@/lib/playerIndex";
import { playerIdOf, playerPath } from "@/lib/playerPath";
import { seasonPath, withQuery } from "@/lib/slug";
import { guard, guardMeta } from "@/lib/loadGuard";

// Drawn for the request when the address has a query (lib/routing.ts); without one, s/[league]/player/[player] keeps this page and revalidates it every day. The data behind it keeps its one-day cache (lib/api/client.ts).

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
  const coached = (await getPersonCoaching(p.person_id)).length > 0;
  const bits = [positionNames(positionCodes(p.positions, p.position), at.home, await getPositions(), locale) || null, (p.leagues ?? []).map((l) => (isLeague(l) ? LG[l] : l)).join(", ") || null,
    p.award_count ? plural("count.awards", p.award_count) : null, p.championship_count ? plural("count.championships", p.championship_count) : null].filter(Boolean);
  const details = bits.length ? say("player.metaDetails", { list: bits.join(", ") }) : "";
  return pageMeta({ title: p.name, description: say(coached ? "player.metaDescRoles" : "player.metaDesc", { name: p.name, details }), path: at.path, locale });
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
  const [brands, summary, record, retired, coaching, staff, allStar] = await Promise.all([getBrands(), getSummary(), getPlayerRecord(d.person.person_id), getPersonRetired(d.person.person_id), getPersonCoaching(d.person.person_id), getPersonStaff(d.person.person_id), orElse(getPersonAllStar(d.person.person_id), [] as PersonAllStar[])]);
  const { person: p, teams } = d;
  // The clubs of the All-Star lines: which club a line names depends on the league and the season of the game.
  const asLeagues = [...new Set(allStar.map((r) => r.league))];
  const [asClubs, asData] = await Promise.all([Promise.all(asLeagues.map((l) => getClubs(l))), Promise.all(asLeagues.map((l) => orElse(getAllStar(l), { events: [], games: [], mvps: [] })))]);
  const asClub = (r: PersonAllStar) => asClubs[asLeagues.indexOf(r.league)];
  const asSeason = (r: PersonAllStar) => asData[asLeagues.indexOf(r.league)].events.find((e) => e.year === r.year && e.event_no === r.event_no)?.season_year ?? null;
  const coachCodes = coaching.length ? COACH_AWARDS : new Set<string>();
  const awards = d.awards.filter((a) => !coachCodes.has(a.award_code));
  const coachAwards = d.awards.filter((a) => coachCodes.has(a.award_code));
  const played = Boolean(p.seasons_played || teams.length || record.seasonTeams.length || record.stats.length);
  const multi = [played, coaching.length > 0, staff.length > 0].filter(Boolean).length > 1;
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

  const titles = careerTitles(teams, record, summary.seasons);
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

  const awardCols = (items: typeof d.awards) => tableOf(items, [
    { key: "season", label: say("col.season"), num: true, get: (r) => r.year, cell: (r) => <Link href={seasonPath(r.league, r.year)} prefetch={false}>{`${leagueName(r.league)} ${seasonLabel(r.league, r.year)}`}</Link> },
    { key: "award", label: say("col.award"), cls: "team", get: (r) => r.award, cell: (r) => <Link href={trophyPath(r.award_code)} prefetch={false}>{r.award}</Link> },
    { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team, cell: (r) => (r.team ? <TeamLabel lg={r.league} f={r.franchise_id} name={r.team} logo={logoFor(brands, r.franchise_id, r.year)} /> : "") },
    { key: "note", label: say("col.note"), cls: "note", get: (r) => r.note, cell: (r) => r.note || "" },
  ], (r, i) => `${r.award_code}|${r.year}|${i}`);
  const awardTable = awardCols(awards);
  const coachAwardTable = awardCols(coachAwards);
  const teamTable = tableOf(teams, [
    { key: "from", label: say("col.from"), num: true, get: (t) => t.from_year, cell: (t) => <Link href={seasonPath(t.league, t.from_year)} prefetch={false}>{seasonLabel(t.league, t.from_year)}</Link> },
    { key: "to", label: say("col.to"), num: true, get: (t) => t.to_year, cell: (t) => (t.to_year === t.from_year ? "" : <Link href={seasonPath(t.league, t.to_year)} prefetch={false}>{seasonLabel(t.league, t.to_year)}</Link>) },
    { key: "team", label: say("col.team"), cls: "team", get: (t) => t.team, cell: (t) => <TeamLabel lg={t.league} f={t.franchise_id} name={t.team || say("team.fallback", { id: t.franchise_id })} logo={logoFor(brands, t.franchise_id, t.to_year)} /> },
    { key: "league", label: say("col.league"), get: (t) => leagueName(t.league) },
  ], (t) => `${t.league}|${t.franchise_id}|${t.from_year}`);

  const allStarTable = tableOf<PersonAllStar>(allStar, [
    { key: "year", label: say("allstar.col.year"), num: true, get: (r) => r.year + r.event_no / 10, cell: (r) => r.year },
    { key: "game", label: say("allstar.col.game"), cls: "team", get: (r) => `${leagueName(r.league)} ${r.year}`, cell: (r) => <Link href={allStarPath(r.league, r.year)} prefetch={false}>{eventName(say, r.league, leagueName(r.league), r.year)}</Link> },
    {
      key: "as", label: say("allstar.col.role"), get: (r) => (r.mvp ? 0 : 1),
      cell: (r) => (r.mvp ? say(r.role || r.side ? "allstar.player.pickedMvp" : "allstar.player.mvp") : r.role ? say("allstar.player.as", { role: roleWord(say, r.role) ?? "", side: r.side ?? "" }) : r.side ?? say("allstar.player.picked")),
    },
    { key: "pos", label: say("allstar.col.pos"), get: (r) => r.position, cell: (r) => book.list(r.position ? r.position.split("/") : null, null, [r.league]) },
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => {
        const season = asSeason(r), f = asClub(r).match(r.team, season);
        return f != null ? <TeamLabel lg={r.league} f={f} name={r.team} logo={asClub(r).logo(f, season)} year={season ?? undefined} /> : r.team ?? "";
      },
    },
  ], (r) => `${r.league}|${r.year}|${r.event_no}`);

  const coachTable = tableOf(coaching, [
    { key: "from", label: say("col.from"), num: true, get: (c) => c.from, cell: (c) => <Link href={seasonPath(c.league, c.from)} prefetch={false}>{seasonLabel(c.league, c.from)}</Link> },
    { key: "to", label: say("col.to"), num: true, get: (c) => c.to, cell: (c) => (c.to === c.from ? "" : <Link href={seasonPath(c.league, c.to)} prefetch={false}>{seasonLabel(c.league, c.to)}</Link>) },
    { key: "team", label: say("col.team"), cls: "team", get: (c) => c.team, cell: (c) => <TeamLabel lg={c.league} f={c.franchise} name={c.team || say("team.fallback", { id: c.franchise })} logo={logoFor(brands, c.franchise, c.to)} /> },
    { key: "league", label: say("col.league"), get: (c) => leagueName(c.league) },
    { key: "seasons", label: say("col.seasons"), num: true, get: (c) => c.seasons },
    { key: "record", label: say("col.record"), num: true, get: (c) => (c.sole ? c.rec.w / Math.max(1, c.rec.w + c.rec.l + c.rec.t + c.rec.otl) : null), cell: (c) => (c.sole ? `${recordText(c.rec)}${c.sole < c.seasons ? "*" : ""}` : "") },
    ...(coaching.some((c) => c.playoffs) ? [
      { key: "playoffs", label: say("col.playoffs"), num: true, get: (c: (typeof coaching)[number]) => (c.playoffs ? c.playoffs.w / Math.max(1, c.playoffs.games) : null), cell: (c: (typeof coaching)[number]) => (c.playoffs ? recordText(c.playoffs) : "") },
      { key: "series", label: say("col.series"), num: true, get: (c: (typeof coaching)[number]) => (c.playoffs ? c.playoffs.seriesW / Math.max(1, c.playoffs.seriesW + c.playoffs.seriesL) : null), cell: (c: (typeof coaching)[number]) => (c.playoffs && c.playoffs.seriesW + c.playoffs.seriesL ? `${c.playoffs.seriesW}–${c.playoffs.seriesL}` : "") },
    ] : []),
    { key: "titles", label: say("col.titles"), num: true, get: (c) => c.titles.length, cell: (c) => c.titles.map((y) => seasonLabel(c.league, y)).join(", ") },
  ], (c) => `${c.league}|${c.franchise}|${c.from}`);
  const staffTable = tableOf(staff, [
    { key: "from", label: say("col.from"), num: true, get: (c) => c.from, cell: (c) => <Link href={seasonPath(c.league, c.from)} prefetch={false}>{seasonLabel(c.league, c.from)}</Link> },
    { key: "to", label: say("col.to"), num: true, get: (c) => c.to, cell: (c) => (c.to === c.from ? "" : <Link href={seasonPath(c.league, c.to)} prefetch={false}>{seasonLabel(c.league, c.to)}</Link>) },
    { key: "team", label: say("col.team"), cls: "team", get: (c) => c.team, cell: (c) => <TeamLabel lg={c.league} f={c.franchise} name={c.team || say("team.fallback", { id: c.franchise })} logo={logoFor(brands, c.franchise, c.to)} /> },
    { key: "league", label: say("col.league"), get: (c) => leagueName(c.league) },
    { key: "role", label: say("col.role"), get: (c) => c.role, cell: (c) => (c.role === "general_manager" ? say("staff.generalManager") : c.role === "president" ? say("staff.president") : (c.position ?? say("staff.assistantCoach"))) },
    { key: "seasons", label: say("col.seasons"), num: true, get: (c) => c.seasons },
  ], (c) => `${c.league}|${c.franchise}|${c.role}|${c.position ?? ""}|${c.from}`);
  const coachTitles = coaching.reduce((n, c) => n + c.titles.length, 0);
  const coachSeasons = coaching.reduce((n, c) => n + c.seasons, 0);
  const coachClubs = new Set(coaching.map((c) => `${c.league}|${c.franchise}`)).size;
  const partial = coaching.some((c) => c.sole < c.seasons);

  return (
    <>
      {isLeague(home) ? <AccentStyle league={home} /> : null}
      <section className="head fade">
        {homePin ? <BirthMap home={homePin} pins={[homePin, ...teamPins]} name={p.name} /> : null}
        <PlayerRetired
          rows={retired}
          team={(r) => teams.filter((t) => t.league === r.league && t.franchise_id === r.franchise_id).sort((a, b) => b.to_year - a.to_year)[0]?.team || say("team.fallback", { id: r.franchise_id ?? 0 })}
          href={(r) => `${paths.team(r.league, r.franchise_id ?? 0)}#retired`}
        />
        <span className="eyebrow">{lgs.length ? lgs.map((l) => LG[l]).join(" · ") : say(played ? "player.eyebrow" : coaching.length || !staff.length ? "player.roleCoach" : "player.roleStaff")}</span>
        <h1>{p.name}</h1>
        {p.birth_date ? <p className="lede">{p.death_date ? say("player.lifespan", { from: yr(p.birth_date), to: yr(p.death_date) }) : say("player.bornYear", { year: yr(p.birth_date) })}</p> : null}
        {board ? <PlayerCompare id={p.person_id} /> : null}
      </section>
      {facts.length ? <dl className="pfacts">{facts}</dl> : <p className="note">{say("player.noBio")}</p>}
      {multi ? (
        <nav className="rolechips" aria-label={say("player.roles")}>
          {played ? <a href="#playing">{say("player.rolePlayer")}</a> : null}
          {coaching.length ? <a href="#coaching">{say("player.roleCoach")}</a> : null}
          {staff.length ? <a href="#staff">{say("player.roleStaff")}</a> : null}
        </nav>
      ) : null}
      {multi && played ? <h2 id="playing" className="rolehead">{say("player.playingCareer")}</h2> : null}
      <PlayerTitles titles={titles} />
      <CupsProvider markup={cupsFor(titles.map((t) => t.league))}>
        {board ? <PlayerBoard data={board} /> : null}
        <PlayerResume resume={record.resume} seasons={record.seasonTeams} brands={brands} />
      </CupsProvider>
      {awards.length ? (
        <section className="section">
          <h2>{say("player.awards")}</h2>
          <div className="tablebox"><SortTable {...awardTable} param="sort_awards" def="season.desc" /></div>
        </section>
      ) : null}
      {allStar.length ? (
        <section className="section">
          <h2>{say("allstar.player.title")}</h2>
          <div className="tablebox"><SortTable {...allStarTable} param="sort_allstar" def="year.desc" /></div>
          <p className="note">{say("allstar.player.note")}</p>
        </section>
      ) : null}
      {teams.length ? (
        <section className="section">
          <h2>{say("player.teams")}</h2>
          <div className="tablebox"><SortTable {...teamTable} param="sort_teams" def="from.asc" /></div>
        </section>
      ) : null}
      {coaching.length ? (
        <section className="section" id="coaching">
          <h2 className={multi ? "rolehead" : undefined}>{say("player.coachingCareer")}</h2>
          <dl className="pfacts">
            <Fact label={say("coach.factSeasons")}>{fmt(coachSeasons)}</Fact>
            <Fact label={say("coach.factClubs")}>{fmt(coachClubs)}</Fact>
            {coachTitles ? <Fact label={say("coach.factTitles")}>{fmt(coachTitles)}</Fact> : null}
            {coachAwards.length ? <Fact label={say("coach.factAwards")}>{fmt(coachAwards.length)}</Fact> : null}
          </dl>
          <div className="tablebox"><SortTable {...coachTable} param="sort_coach" def="from.asc" /></div>
          <p className="note">{say("coach.note")}{partial ? ` ${say("coach.noteShared")}` : ""}{coaching.some((c) => c.playoffs) ? ` ${say("coach.notePlayoffs")}` : ""}</p>
          {coachAwards.length ? (
            <>
              <h3>{say("coach.awards")}</h3>
              <div className="tablebox"><SortTable {...coachAwardTable} param="sort_coachawards" def="season.desc" /></div>
            </>
          ) : null}
        </section>
      ) : null}
      {staff.length ? (
        <section className="section" id="staff">
          <h2 className={multi ? "rolehead" : undefined}>{say("player.staffCareer")}</h2>
          <div className="tablebox"><SortTable {...staffTable} param="sort_staff" def="from.asc" /></div>
          <p className="note">{say("staff.note")}</p>
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
