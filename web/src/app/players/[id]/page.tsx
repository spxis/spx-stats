import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { BirthMap } from "@/components/BirthMap";
import { Flag } from "@/components/Flag";
import { Rich } from "@/components/i18n/Rich";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamLink } from "@/components/ui";
import { brandFor } from "@/lib/brand";
import { getBrands, getSummary } from "@/lib/data";
import { atUtc } from "@/lib/format";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { PlayerResume } from "@/components/PlayerResume";
import { parsePhase, PlayerSeasons, PlayerStatistics } from "@/components/PlayerStats";
import { getPerson, getPlayerRecord } from "@/lib/people";
import { ageOn, capFirst, countryName, inches } from "@/lib/people-format";
import { tableOf } from "@/lib/sort";
import "@/components/people.css";

// Drawn per request (the language cookie); the data behind it keeps its one-hour cache (next: { revalidate } in lib/api/client.ts).

const idOf = (v: string) => (/^\d{1,9}$/.test(v) ? Number(v) : null);

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const { id } = await params;
  const n = idOf(id);
  const d = n == null ? null : await getPerson(n).catch(() => null);
  if (!d) return {};
  const { say, plural, locale } = await currentSpeaker();
  const p = d.person;
  const bits = [p.position ? capFirst(p.position) : null, (p.leagues ?? []).map((l) => (isLeague(l) ? LG[l] : l)).join(", ") || null,
    p.award_count ? plural("count.awards", p.award_count) : null, p.championship_count ? plural("count.championships", p.championship_count) : null].filter(Boolean);
  const details = bits.length ? say("player.metaDetails", { list: bits.join(", ") }) : "";
  return pageMeta({ title: p.name, description: say("player.metaDesc", { name: p.name, details }), path: `/players/${p.person_id}`, locale });
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pfact"><dt>{label}</dt><dd>{children}</dd></div>;
}

export default async function PlayerPage({ params, searchParams }: PageProps<"/players/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const n = idOf(id);
  if (n == null) notFound();
  const { say, locale, dt, fmt } = await currentSpeaker();
  const [d, brands, summary, record] = await Promise.all([getPerson(n).catch(() => null), getBrands(), getSummary(), getPlayerRecord(n)]);
  if (!d) notFound();
  const { person: p, awards, teams } = d;
  const lgs = (p.leagues ?? []).filter(isLeague);
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
  const phase = parsePhase(sp.phase);

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
  if (p.position) facts.push(<Fact key="pos" label={say("player.factPosition")}>{capFirst(p.position)}</Fact>);
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
    { key: "season", label: say("col.season"), num: true, get: (r) => r.year, cell: (r) => <Link href={`/${r.league}/${r.year}`} prefetch={false}>{`${leagueName(r.league)} ${seasonLabel(r.league, r.year)}`}</Link> },
    { key: "award", label: say("col.award"), cls: "team", get: (r) => r.award },
    { key: "team", label: say("col.team"), get: (r) => r.team, cell: (r) => (r.team ? <TeamLink lg={r.league} f={r.franchise_id} name={r.team} /> : "") },
    { key: "note", label: say("col.note"), cls: "note", get: (r) => r.note, cell: (r) => r.note || "" },
  ], (r, i) => `${r.award_code}|${r.year}|${i}`);
  const teamTable = tableOf(teams, [
    { key: "from", label: say("col.from"), num: true, get: (t) => t.from_year, cell: (t) => <Link href={`/${t.league}/${t.from_year}`} prefetch={false}>{seasonLabel(t.league, t.from_year)}</Link> },
    { key: "to", label: say("col.to"), num: true, get: (t) => t.to_year, cell: (t) => (t.to_year === t.from_year ? "" : <Link href={`/${t.league}/${t.to_year}`} prefetch={false}>{seasonLabel(t.league, t.to_year)}</Link>) },
    { key: "team", label: say("col.team"), cls: "team", get: (t) => t.team, cell: (t) => <><TeamLogo url={brandFor(brands, t.franchise_id, t.to_year)?.logo_url} /><TeamLink lg={t.league} f={t.franchise_id} name={t.team || say("team.fallback", { id: t.franchise_id })} /></> },
    { key: "league", label: say("col.league"), get: (t) => leagueName(t.league) },
  ], (t) => `${t.league}|${t.franchise_id}|${t.from_year}`);

  return (
    <>
      <AccentStyle league={lgs[0]} />
      <section className="head fade">
        {p.birth_lat != null && p.birth_lon != null ? <BirthMap lat={p.birth_lat} lon={p.birth_lon} name={p.name} place={p.birth_place} /> : null}
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
              <Link key={`${t.league}${t.year}`} className="full" href={`/${t.league}/${t.year}`} prefetch={false} title={say("player.titleTip", { team: t.team ?? "", league: leagueName(t.league) })}>
                {`${leagueName(t.league)} ${seasonLabel(t.league, t.year)}`}
              </Link>
            ))}
          </div>
          <p className="note">{say("player.titlesNote")}</p>
        </section>
      ) : null}
      {record.seasonTeams.length ? <PlayerSeasons name={p.name} record={record} brands={brands} seasonsHeld={seasonsHeld} /> : null}
      {record.stats.length ? <PlayerStatistics record={record} phase={phase} path={`/players/${p.person_id}`} sp={sp} brands={brands} /> : null}
      <PlayerResume resume={record.resume} seasons={record.seasonTeams} />
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
      <p className="note">
        <Rich text={say("player.credit")} parts={{
          wikidata: <a href="https://www.wikidata.org">Wikidata</a>,
          hata: <a href="https://github.com/johnmorrisdotca/hata">Hata</a>,
        }} />
      </p>
    </>
  );
}
