import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AccentStyle } from "@/components/AccentStyle";
import { TeamFlag } from "@/components/TeamFlag";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamSeasonView } from "@/components/TeamSeasonView";
import { BadgeCup } from "@/components/TrophyIcon";
import { Figures } from "@/components/ui";
import { brandFor, teamAccent } from "@/lib/brand";
import { countryAt } from "@/lib/country";
import { titleHolders } from "@/lib/champions";
import { getBrands, getTeam, getTeamGames, getTeamStandings, getSummary } from "@/lib/data";
import { fmt, fmt3 } from "@/lib/format";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { parseLoc } from "@/lib/loc";
import { pageMeta } from "@/lib/meta";
import { recordText } from "@/lib/record";
import { parseSelection } from "@/lib/season";
import { parseSort } from "@/lib/sort";
import { placeFor } from "@/lib/venue";
import { deriveTeamGames, seasonRecord, teamsIn, TEAM_GAME_SORT_KEYS } from "@/lib/teamSeason";

const idOf = (v: string) => (/^\d{1,9}$/.test(v) ? Number(v) : null);
const yearOf = (v: string) => (/^\d{4}$/.test(v) ? Number(v) : null);

/** The team's season: its games (in date order, or the reverse), its standings row for the year and its brand for the year. */
const load = cache(async (lg: string, y: number, f: number, dir: "asc" | "desc") => {
  const [raw, stAll, brands] = await Promise.all([getTeamGames(lg, y, f, dir), getTeamStandings(lg, f), getBrands()]);
  const st = stAll.find((r) => r.year === y) ?? null;
  const first = raw.find((g) => g.home_f === f) ?? raw[0];
  const mine = first ? (first.home_f === f ? { id: first.home_id, name: first.home } : { id: first.away_id, name: first.away }) : null;
  return { raw, st, brand: brandFor(brands, f, y), place: placeFor(brands, f, y), me: mine, name: st?.team || mine?.name || `Team ${f}` };
});

export async function generateMetadata({ params }: PageProps<"/[league]/[year]/team/[franchise]">): Promise<Metadata> {
  const { league, year, franchise } = await params;
  const y = yearOf(year), f = idOf(franchise);
  if (!isLeague(league) || y == null || f == null) return {};
  const d = await load(league, y, f, "asc");
  if (!d.raw.length) return { robots: { index: false } };
  const season = seasonLabel(league, y);
  const rec = seasonRecord(deriveTeamGames(d.raw, f, d.st), d.st);
  return pageMeta({
    title: `${d.name} ${season} · ${LG[league]}`,
    description: `Every game of the ${d.name} ${season} ${LG[league]} season: ${d.raw.length} games, ${recordText(rec)}, with scores, running record and a calendar of wins and losses.`,
    path: `/${league}/${y}/team/${f}`,
  });
}

export default async function TeamSeasonPage({ params, searchParams }: PageProps<"/[league]/[year]/team/[franchise]">) {
  const { league: lg, year, franchise } = await params;
  const y = yearOf(year), f = idOf(franchise);
  if (!isLeague(lg) || y == null || f == null) notFound();
  const sp = await searchParams;
  const sort = parseSort(sp.sort, TEAM_GAME_SORT_KEYS, "date.asc");
  const dateSort = sort.find((s) => s.key === "date");
  const [d, t, summary] = await Promise.all([load(lg, y, f, dateSort?.dir ?? "asc"), getTeam(lg, f), getSummary()]);
  if (!d.raw.length) {
    return (
      <>
        <AccentStyle league={lg} />
        <p className="note">No games for that team in that season.</p>
        <p><Link href={`/${lg}/${y}`}>Back to the season</Link></p>
      </>
    );
  }
  const { raw, st, brand: b, place, me, name } = d;
  const games = deriveTeamGames(raw, f, st);
  const rec = seasonRecord(games, st);
  const season = seasonLabel(lg, y);
  const years = (t?.seasons ?? []).map((s) => s[0]).sort((a, c) => a - c);
  const prev = years.filter((v) => v < y).at(-1), next = years.find((v) => v > y);
  const isChamp = titleHolders(summary.seasons, lg).byYear.get(y)?.champion_franchise === f;
  const text = recordText(rec);
  const decisions = rec.w + rec.l + rec.t + rec.otl;

  const figs: [string, number | string][] = [["Record", text]];
  if (st?.pts != null) figs.push(["Points", st.pts]);
  figs.push(["Winning share", decisions ? fmt3((rec.w + rec.t / 2) / decisions) : "—"]);
  if (st?.pf != null && st.pa != null) figs.push(["Points for", fmt(st.pf)], ["Points against", fmt(st.pa)]);
  if (st?.home) figs.push(["Home", st.home]);
  if (st?.road) figs.push(["Road", st.road]);

  const selection = parseSelection(sp);
  return (
    <>
      <AccentStyle league={lg} team={b?.primary_hex ? teamAccent(b) : undefined} />
      {b?.primary_hex ? (
        <div className="teamband" style={{ "--tp": `#${b.primary_hex}`, "--ts": `#${b.secondary_hex || b.primary_hex}` } as React.CSSProperties} />
      ) : null}
      <section className="head fade">
        {prev != null || next != null ? (
          <nav className="seasonnav" aria-label="Other seasons of this team">
            {prev != null ? <Link href={`/${lg}/${prev}/team/${f}`} rel="prev" prefetch={false}>{"← " + seasonLabel(lg, prev)}</Link> : null}
            {next != null ? <Link href={`/${lg}/${next}/team/${f}`} rel="next" prefetch={false}>{seasonLabel(lg, next) + " →"}</Link> : null}
          </nav>
        ) : null}
        <span className="eyebrow"><Link href={`/${lg}`}>{LG[lg]}</Link>{" · "}<Link href={`/${lg}/${y}`}>{`${season} season`}</Link></span>
        <h1 className="teamname"><TeamLogo url={b?.logo_url} size={56} />{name}<TeamFlag code={countryAt(place?.latitude, place?.longitude)} /></h1>
        {isChamp ? <span className="reigning"><BadgeCup league={lg} />{`${season} champions`}</span> : null}
        <p className="lede">
          {`Every game of the ${season} season: ${text}. `}
          <Link href={`/${lg}/team/${f}`}>All seasons of the franchise</Link>{" · "}
          <Link href={`/${lg}/${y}?team=${me?.id}`}>{`The whole ${LG[lg]} season`}</Link>
        </p>
      </section>
      <Figures items={figs} />
      <TeamSeasonView lg={lg} season={season} year={y} initialLoc={parseLoc(sp.loc)} meId={me?.id ?? 0} games={games} teams={teamsIn(raw)} record={rec}
        initial={{ ...selection, team: "" }} initialSort={sort} />
    </>
  );
}
