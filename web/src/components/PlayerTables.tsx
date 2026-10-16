"use client";

import Link from "@/components/Link";
import { sumStats, type StatRow } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { showStat, type StatCol } from "@/lib/playerStats";
import { STAT_GROUPS } from "@/lib/playerStats";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { seasonPath } from "@/lib/slug";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { MiniCup } from "./TrophyIcon";
import { NoSeason } from "./ui";
import type { BoardView } from "./playerView";

const leagueName = (l: string) => (isLeague(l) ? LG[l] : l);

/** Every club-season in the seasons chosen, with the counting numbers and the rates worked out from them, and the total of those seasons under it. */
export function PlayerStatTables({ view }: { view: BoardView }) {
  const { say, fmt, plural } = useSpeaker();
  const many = new Set(view.data.stats.map((s) => s.league)).size > 1;
  const cell = (cols: StatCol[]) => cols.map((c): ColumnSpec<{ stats: StatRow["stats"] }> => {
    const v = (r: { stats: StatRow["stats"] }) => c.get(r.stats);
    return { key: c.key, label: say(c.label as PhraseKey), title: say(c.title as PhraseKey), num: true, get: v, cell: (r) => showStat(c.kind, v(r), fmt) };
  });
  return (
    <div className="ptables">
      {view.groups.filter((g) => g.rows.length).map((g) => {
        const cols = [...STAT_GROUPS[g.def.id].cols];
        const clubOf = (r: StatRow) => view.data.clubs[`${r.league}|${r.f}|${r.year}`];
        const seasonCol: ColumnSpec<StatRow> = { key: "season", label: say("col.season"), num: true, get: (r) => r.year,
          cell: (r) => (
            <button type="button" className="linkish" title={say("player.statsView", { name: view.data.name, season: seasonLabel(r.league, r.year) })} onClick={() => view.setSpan(r.year, r.year)}>
              {many ? `${leagueName(r.league)} ${seasonLabel(r.league, r.year)}` : seasonLabel(r.league, r.year)}
            </button>
          ) };
        const teamCol: ColumnSpec<StatRow> = { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
          cell: (r) => <TeamLabel lg={r.league} f={r.f} name={r.team ?? say("team.fallback", { id: r.f })} year={r.year} logo={clubOf(r)?.logo} /> };
        const seasonTable = tableOf(g.rows, [seasonCol, teamCol, ...(cell(cols) as unknown as ColumnSpec<StatRow>[])], (r) => `${r.league}|${r.year}|${r.ts}|${r.phase}`);
        const total = sumStats(g.rows);
        const nSeasons = new Set(g.rows.map((r) => `${r.league}|${r.year}`)).size;
        const first = Math.min(...g.rows.map((r) => r.year)), last = Math.max(...g.rows.map((r) => r.year));
        const totalCol: ColumnSpec<{ stats: StatRow["stats"] }> = { key: "season", label: say("board.rangeTotals"), get: () => 0,
          cell: () => `${seasonLabel(g.league, first)}${last > first ? `–${seasonLabel(g.league, last)}` : ""} · ${plural("player.careerSeasons", nSeasons)}` };
        const totalTable = tableOf([{ stats: total }], [totalCol, ...cell(cols)], () => "total");
        return (
          <div key={g.def.id} className="section">
            <h3>{say(g.def.title as PhraseKey)}</h3>
            <div className="tablebox"><SortTable {...seasonTable} param={`sort_${g.def.id}`} def="season.asc" /></div>
            <h4>{say("board.rangeTotals")}</h4>
            <div className="tablebox"><SortTable {...totalTable} param={`sort_${g.def.id}_total`} /></div>
          </div>
        );
      })}
    </div>
  );
}

/** Every club-season we know of in the seasons chosen, with a grey "did not play" row for each year between a player's first and last in a league that they have none. */
export function PlayerSeasonsTable({ view }: { view: BoardView }) {
  const { say } = useSpeaker();
  const { data, state } = view;
  if (!data.seasons.length) return null;
  type Row = { league: string; year: number; label: string; gap: boolean; f: number | null; team: string | null; reg: boolean; po: boolean; teamPo: boolean; champ: boolean };
  const held = new Set(data.held);
  const rows: Row[] = data.seasons.map((s) => ({ league: s.league, year: s.year, label: s.label, gap: false, f: s.f, team: s.team, reg: s.reg, po: s.po, teamPo: s.teamPo, champ: s.champ }));
  const byLeague = new Map<string, Set<number>>();
  for (const s of data.seasons) byLeague.set(s.league, (byLeague.get(s.league) ?? new Set()).add(s.year));
  for (const [league, years] of byLeague) {
    const ys = [...years];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      if (!years.has(y)) rows.push({ league, year: y, label: seasonLabel(league, y), gap: true, f: null, team: null, reg: false, po: false, teamPo: false, champ: false });
    }
  }
  const shown = rows.filter((r) => r.year >= state.span.from && r.year <= state.span.to);
  const many = byLeague.size > 1;
  const gapNote = (r: Row) => (held.has(`${r.league}|${r.year}`) ? <NoSeason kind="team" compact /> : <NoSeason kind="league" compact />);
  const specs: ColumnSpec<Row>[] = [
    { key: "season", label: say("col.season"), num: true, get: (r) => r.year * 10 + (r.gap ? 0 : 1),
      cell: (r) => <Link href={seasonPath(r.league, r.year)} prefetch={false}>{many ? `${leagueName(r.league)} ${r.label}` : r.label}</Link> },
    { key: "team", label: say("col.team"), cls: "team", get: (r) => r.team,
      cell: (r) => (r.gap ? gapNote(r) : <TeamLabel lg={r.league} f={r.f} name={r.team ?? say("team.fallback", { id: r.f ?? 0 })} year={r.year} logo={data.clubs[`${r.league}|${r.f}|${r.year}`]?.logo} />) },
    { key: "reg", label: say("phase.regular"), get: (r) => (r.reg ? 1 : 0), cell: (r) => (r.reg ? "✓" : "") },
    { key: "po", label: say("phase.playoffs"), get: (r) => (r.po ? 2 : r.teamPo ? 1 : 0),
      cell: (r) => (r.po ? "✓" : r.teamPo ? <span title={say("player.teamPlayoffsTip")}>(✓)</span> : "") },
    { key: "title", label: say("trophy.champion"), get: (r) => (r.champ ? 1 : 0), cell: (r) => (r.champ ? <MiniCup league={r.league} /> : "") },
  ];
  const table = tableOf(shown, specs, (r) => `${r.league}|${r.year}|${r.team ?? "gap"}`);
  return (
    <section className="section">
      <h2>{say("player.seasonsTitle")}</h2>
      <div className="tablebox"><SortTable {...table} param="sort_seasons" def="season.desc" /></div>
      <p className="note">{say("player.seasonsNote", { name: data.name })}</p>
    </section>
  );
}
