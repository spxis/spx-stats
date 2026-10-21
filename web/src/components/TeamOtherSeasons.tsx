import Link from "@/components/Link";
import { SortTable } from "@/components/SortTable";
import { TeamLogo } from "@/components/TeamLogo";
import type { StandingRow } from "@/lib/api/types";
import { logoFor, type BrandMap } from "@/lib/brand";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel, type LeagueCode } from "@/lib/leagues";
import { tableOf } from "@/lib/sort";

/**
 * The club's seasons in another league of its family (a PCHA club on its NHL page, an NHL club on its WHA page): the same columns as the standings table, newest first,
 * each season a link to the club's page for it. A season with no record on file (a Stanley Cup final only) is left out; the Cup section lists those.
 */
export async function TeamOtherSeasons({ league, f, rows, titles, brands, href }: {
  league: LeagueCode; f: number; rows: StandingRow[]; titles: ReadonlySet<number>; brands: BrandMap; href: (year: number) => string;
}) {
  const { say, plural, fmt } = await currentSpeaker();
  const showT = rows.some((r) => r.t), showP = rows.some((r) => r.pts != null);
  const table = tableOf(rows, [
    {
      key: "year", label: say("col.season"), cls: "seasoncell", get: (r) => r.year,
      cell: (r) => <Link href={href(r.year)} prefetch={false}>{seasonLabel(league, r.year)}</Link>,
    },
    {
      key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => <><TeamLogo url={logoFor(brands, f, r.year)} />{r.team}{titles.has(r.year) ? <span className="defending winner">{say("season.winner")}</span> : null}</>,
    },
    { key: "gp", label: say("col.gp"), num: true, get: (r) => r.gp },
    { key: "w", label: say("col.w"), num: true, get: (r) => r.w },
    { key: "l", label: say("col.l"), num: true, get: (r) => r.l },
    ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (r: StandingRow) => r.t }] : []),
    ...(showP ? [{ key: "pts", label: say("col.pts"), num: true, get: (r: StandingRow) => r.pts }] : []),
    { key: "pf", label: say("col.for"), num: true, get: (r) => r.pf, cell: (r) => (r.pf != null ? fmt(r.pf) : "") },
    { key: "pa", label: say("col.against"), num: true, get: (r) => r.pa, cell: (r) => (r.pa != null ? fmt(r.pa) : "") },
  ], (r) => r.year);
  return (
    <section className="section" id={`league-${league}`}>
      <h2>{say("team.otherSeasons", { league: LG[league] })}</h2>
      <p className="note">{say("team.otherSeasonsNote", { league: LG[league], seasons: plural("count.seasons", rows.length) })}</p>
      <div className="scroll"><SortTable {...table} param={`sort_${league}`} def="year.desc" /></div>
    </section>
  );
}
