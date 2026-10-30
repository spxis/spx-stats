"use client";

import { useMemo } from "react";
import Link from "./Link";
import { NatLink } from "./NatLink";
import { PositionList } from "./PositionCode";
import { PlayerTeamChips } from "./PlayerTeamChips";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { isLeague, LG } from "@/lib/leagues";
import { countryName } from "@/lib/people-format";
import { POSITION_SEP } from "@/lib/positions";
import type { PlayerCols, PlayerLine } from "@/lib/playerLines";
import { tableOf, type ColumnSpec, type SortKey } from "@/lib/sort";

/**
 * The players list's table, drawn in the browser from the page's short lines (lib/playerLines.ts). The page keeps the order: a sort by a column the list
 * can order asks the server for the rows in that order (`remote`), exactly as before. `natTpl` is the list's address with `{code}` where a country goes.
 */
export function PlayersTable({ lines, names, cols, natTpl, def, initial }: {
  lines: readonly PlayerLine[]; names: readonly string[]; cols: PlayerCols; natTpl: string; def: string; initial: SortKey[];
}) {
  const { say, fmt, locale } = useSpeaker();
  const table = useMemo(() => {
    const specs: ColumnSpec<PlayerLine>[] = [
      { key: "name", label: say("col.name"), cls: "team", rest: "name", get: (p) => p.n, cell: (p) => <Link href={p.h} prefetch={false}>{p.n}</Link> },
      { key: "league", label: say("col.league"), rest: "leagues", get: (p) => p.lg.map((l) => (isLeague(l) ? LG[l] : l)).join(", ") },
      { key: "position", label: say("player.factPosition"), rest: "position", get: (p) => p.p.map((x) => x[0]).join(POSITION_SEP), cell: (p) => <PositionList items={p.p.map(([code, at]) => ({ code, name: at >= 0 ? names[at] : null }))} /> },
    ];
    if (cols.teams) {
      specs.push({
        key: "teams", label: say("players.teamsCol"), title: say("players.teamsTitle"), cls: "nowrap", get: (p) => (p.t ? p.t[0].length + p.t[1].length : 0),
        cell: (p) => <PlayerTeamChips shown={p.t?.[0] ?? []} more={p.t?.[1] ?? []} />,
      });
    }
    if (cols.country) {
      specs.push({
        key: "country", label: say("players.colCountry"), title: say("players.countryTitle"), get: (p) => (p.c ? countryName(p.c, locale) : ""),
        cell: (p) => (p.c ? <NatLink href={natTpl.replace("{code}", p.c.toUpperCase())} title={say("players.byCountry", { name: countryName(p.c, locale) })} code={p.nf ? null : p.c} /> : null),
      });
    }
    specs.push(
      { key: "years", label: say("col.years"), cls: "nowrap", title: say("players.yearsTitle"), rest: "last_season", get: (p) => p.e, cell: (p) => (p.f == null ? "" : p.e != null && p.e !== p.f ? `${p.f}–${p.e}` : String(p.f)) },
      { key: "seasons", label: say("players.colSeasons"), num: true, rest: "seasons_played", get: (p) => p.s, cell: (p) => fmt(p.s) },
      { key: "awards", label: say("players.colAwards"), num: true, rest: "award_count", get: (p) => p.a, cell: (p) => fmt(p.a) },
    );
    if (cols.titles) specs.push({ key: "titles", label: say("titles.col"), title: say("titles.career"), num: true, nosort: true, get: (p) => p.w ?? 0, cell: (p) => fmt(p.w ?? 0) });
    return tableOf(lines, specs, (p) => p.i);
  }, [lines, names, cols, natTpl, say, fmt, locale]);
  return <SortTable {...table} def={def} initial={initial} remote />;
}
