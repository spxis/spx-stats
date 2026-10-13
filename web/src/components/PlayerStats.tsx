import Link from "next/link";
import { NoSeason } from "@/components/ui";
import { TeamLabel } from "@/components/TeamLabel";
import { PlayerChart, type SeasonPoint } from "@/components/PlayerChart";
import { MiniCup } from "@/components/TrophyIcon";
import { SortTable } from "@/components/SortTable";
import { queryHref } from "@/components/ViewTabs";
import type { PlayerRecord } from "@/lib/people";
import type { BrandMap } from "@/lib/brand";
import { logoFor } from "@/lib/brand";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { showStat, STAT_GROUP_ORDER, STAT_GROUPS, type StatCol } from "@/lib/playerStats";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import type { PersonStatRow, PersonTotalRow, StatNumbers } from "@/lib/api/player";
import { seasonPath } from "@/lib/slug";

export type PlayerPhase = "regular" | "playoffs";
type Query = Record<string, string | string[] | undefined>;

export const parsePhase = (raw: unknown): PlayerPhase => ((Array.isArray(raw) ? raw[0] : raw) === "p" ? "playoffs" : "regular");

const leagueName = (l: string) => (isLeague(l) ? LG[l] : l);

/** Seasons: a row for every club-season we know of, with a grey "did not play" row for each year between a player's first and last in a league that they have none. */
export async function PlayerSeasons({ name, record, brands, seasonsHeld }: { name: string; record: PlayerRecord; brands: BrandMap; seasonsHeld: Set<string> }) {
  const { say } = await currentSpeaker();
  type Row = { league: string; year: number; label: string; gap: boolean; f: number | null; team: string | null; reg: boolean; po: boolean; teamPo: boolean; champ: boolean };
  const rows: Row[] = record.seasonTeams.map((s) => ({ league: s.league, year: s.year, label: s.season_label, gap: false, f: s.franchise_id, team: s.team,
    reg: s.played_regular, po: s.played_playoffs, teamPo: s.team_made_playoffs, champ: s.team_champion }));
  const byLeague = new Map<string, Set<number>>();
  for (const s of record.seasonTeams) byLeague.set(s.league, (byLeague.get(s.league) ?? new Set()).add(s.year));
  for (const [league, years] of byLeague) {
    const ys = [...years];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      if (!years.has(y)) rows.push({ league, year: y, label: seasonLabel(league, y), gap: true, f: null, team: null, reg: false, po: false, teamPo: false, champ: false });
    }
  }
  const many = byLeague.size > 1;
  const gapNote = (r: Row) => (seasonsHeld.has(`${r.league}|${r.year}`) ? <NoSeason kind="team" compact /> : <NoSeason kind="league" compact />);
  const specs: ColumnSpec<Row>[] = [
    { key: "season", label: say("col.season"), num: true, get: (r) => r.year * 10 + (r.gap ? 0 : 1),
      cell: (r) => <Link href={seasonPath(r.league, r.year)} prefetch={false}>{many ? `${leagueName(r.league)} ${r.label}` : r.label}</Link> },
    { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => (r.gap ? gapNote(r) : <TeamLabel lg={r.league} f={r.f} name={r.team ?? say("team.fallback", { id: r.f ?? 0 })} year={r.year} logo={logoFor(brands, r.f, r.year)} />) },
    { key: "reg", label: say("phase.regular"), get: (r) => (r.reg ? 1 : 0), cell: (r) => (r.reg ? "✓" : "") },
    { key: "po", label: say("phase.playoffs"), get: (r) => (r.po ? 2 : r.teamPo ? 1 : 0),
      cell: (r) => (r.po ? "✓" : r.teamPo ? <span title={say("player.teamPlayoffsTip")}>(✓)</span> : "") },
    { key: "title", label: say("trophy.champion"), get: (r) => (r.champ ? 1 : 0), cell: (r) => (r.champ ? <MiniCup league={r.league} /> : "") },
  ];
  const table = tableOf(rows, specs, (r) => `${r.league}|${r.year}|${r.team ?? "gap"}`);
  return (
    <section className="section">
      <h2>{say("player.seasonsTitle")}</h2>
      <div className="tablebox"><SortTable {...table} param="sort_seasons" def="season.desc" /></div>
      <p className="note">{say("player.seasonsNote", { name })}</p>
    </section>
  );
}

function statSpecs<T extends { stats: StatNumbers }>(cols: StatCol[], say: (k: PhraseKey) => string, fmtInt: (n: number) => string, extra: ColumnSpec<T>[]): ColumnSpec<T>[] {
  return [...extra, ...cols.map((c): ColumnSpec<T> => {
    const v = (r: T) => c.get(r.stats);
    return { key: c.key, label: say(c.label as PhraseKey), title: say(c.title as PhraseKey), num: true, get: v, cell: (r) => showStat(c.kind, v(r), fmtInt) };
  })];
}

/** The statistics of one phase: for each stat group, the seasons and the career totals, and a chart of the main stat. */
export async function PlayerStatistics({ name, record, phase, path, sp, brands }: { name: string; record: PlayerRecord; phase: PlayerPhase; path: string; sp: Query; brands: BrandMap }) {
  const { say, fmt, plural } = await currentSpeaker();
  const phases: [PlayerPhase, string][] = [["regular", say("phase.regular")], ["playoffs", say("phase.playoffs")]];
  const leaguesWithStats = new Set(record.stats.map((s) => s.league));
  const many = leaguesWithStats.size > 1;
  // Clubs the player has statistics with; ?teams=<league:franchise>,... keeps only those (none chosen: all).
  const teamKey = (r: { league: string; franchise_id: number | null }) => `${r.league}:${r.franchise_id}`;
  const clubs = new Map<string, string>();
  for (const r of [...record.stats].sort((a, c) => a.year - c.year)) clubs.set(teamKey(r), r.team ?? say("team.fallback", { id: r.franchise_id }));
  const raw = Array.isArray(sp.teams) ? sp.teams[0] : sp.teams;
  const picked = new Set((raw ?? "").split(",").filter((k) => clubs.has(k)));
  const filtered = picked.size > 0 && picked.size < clubs.size;
  const toggle = (key: string) => {
    const next = new Set(picked);
    if (!next.delete(key)) next.add(key);
    return queryHref(path, sp, { teams: next.size && next.size < clubs.size ? [...next].join(",") : null });
  };
  // ?season=<year> shows that one season of every club.
  const rawYear = Number(Array.isArray(sp.season) ? sp.season[0] : sp.season);
  const year = record.stats.some((s) => s.year === rawYear) ? rawYear : 0;
  const yearLeague = year ? record.stats.find((s) => s.year === year)!.league : "";
  const blocks = STAT_GROUP_ORDER.flatMap((gid) => {
    const g = STAT_GROUPS[gid];
    const seasons = record.stats.filter((s) => s.stat_group === gid && s.phase === phase && (!filtered || picked.has(teamKey(s))) && (!year || s.year === year));
    const totals = filtered || year ? [] : record.totals.filter((t) => t.stat_group === gid && t.phase === phase);
    return seasons.length ? [{ g, seasons, totals }] : [];
  });
  return (
    <section className="section" id="statistics">
      <h2>{say("player.statsFor", { name })}</h2>
      <nav className="seg views" aria-label={say("phase.aria")}>
        {phases.map(([k, label]) => (
          <Link key={k} href={queryHref(path, sp, { phase: k === "regular" ? null : "p" })} prefetch={false} scroll={false} aria-current={k === phase ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {clubs.size > 1 ? (
        <nav className="seg views scroll" aria-label={say("player.teamFilter")}>
          <Link href={queryHref(path, sp, { teams: null })} prefetch={false} scroll={false} aria-current={filtered ? undefined : "page"}>{say("player.allTeams")}</Link>
          {[...clubs].map(([key, label]) => (
            <Link key={key} href={toggle(key)} prefetch={false} scroll={false} aria-current={filtered && picked.has(key) ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
      ) : null}
      {year ? (
        <p className="note">
          {say("player.statsSeason", { season: seasonLabel(yearLeague, year) })}{" "}
          <Link href={`${queryHref(path, sp, { season: null })}#statistics`} prefetch={false} scroll={false}>{say("player.statsAllSeasons")}</Link>{" · "}
          <Link href={seasonPath(yearLeague, year)} prefetch={false}>{say("player.statsSeasonPage", { season: seasonLabel(yearLeague, year) })}</Link>
        </p>
      ) : null}
      {blocks.length ? blocks.map(({ g, seasons, totals }) => {
        const seasonCol: ColumnSpec<PersonStatRow> = { key: "season", label: say("col.season"), num: true, get: (r) => r.year,
          cell: (r) => <Link href={`${queryHref(path, sp, { season: String(r.year) })}#statistics`} prefetch={false} scroll={false} title={say("player.statsView", { name, season: seasonLabel(r.league, r.year) })}>{many ? `${leagueName(r.league)} ${seasonLabel(r.league, r.year)}` : seasonLabel(r.league, r.year)}</Link> };
        const teamCol: ColumnSpec<PersonStatRow> = { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
          cell: (r) => <TeamLabel lg={r.league} f={r.franchise_id} name={r.team ?? say("team.fallback", { id: r.franchise_id })} year={r.year} logo={logoFor(brands, r.franchise_id, r.year)} /> };
        const seasonTable = tableOf(seasons, statSpecs([...g.cols], say, fmt, [seasonCol, teamCol]), (r) => `${r.league}|${r.year}|${r.team_season_id}|${r.phase}`);
        const careerCol: ColumnSpec<PersonTotalRow> = { key: "season", label: say("player.career"), get: (r) => r.seasons,
          cell: (r) => `${many ? leagueName(r.league) + " · " : ""}${plural("player.careerSeasons", r.seasons)}` };
        const totalTable = tableOf(totals, statSpecs([...g.cols], say, fmt, [careerCol]), (r) => `${r.league}|${r.phase}|${r.stat_group}`);
        const byYear = new Map<number, number>();
        for (const r of seasons) { const v = g.main.get(r.stats); if (v != null) byYear.set(r.year, (byYear.get(r.year) ?? 0) + v); }
        const lg = seasons[0].league;
        const ys = [...new Set(seasons.map((r) => r.year))];
        const points: SeasonPoint[] = [];
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++) points.push({ year: y, label: seasonLabel(lg, y), value: byYear.get(y) ?? null });
        return (
          <div key={g.id} className="section">
            <h3>{say(g.title as PhraseKey)}</h3>
            <div className="tablebox"><SortTable {...seasonTable} param={`sort_${g.id}`} def="season.asc" /></div>
            {totals.length ? (
              <>
                <h4>{say("player.careerTotals")}</h4>
                <div className="tablebox"><SortTable {...totalTable} param={`sort_${g.id}_total`} /></div>
              </>
            ) : null}
            {!year && points.length > 1 ? <PlayerChart points={points} stat={say(g.main.label as PhraseKey)} aria={say("player.chartAria", { stat: say(g.main.title as PhraseKey) })} /> : null}
          </div>
        );
      }) : <p className="note">{say("player.statsNone")}</p>}
      <p className="note">{say("player.statsCredit")}</p>
    </section>
  );
}
