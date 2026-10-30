"use client";

import { useMemo } from "react";
import Link from "./Link";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { PositionList } from "./PositionCode";
import { SortTable } from "./SortTable";
import { countryName } from "@/lib/people-format";
import { playerPath } from "@/lib/playerPath";
import { showStat } from "@/lib/playerStats";
import { positionsShort } from "@/lib/positions";
import type { RosterLine, RosterTableData } from "@/lib/rosterWire";
import { tableOf, type ColumnSpec } from "@/lib/sort";

/**
 * One roster table of a club's season, drawn from its lines in the browser (and on the server for the first paint). The sort covers every player; `limit` draws the first
 * rows of the sort in force until Show all (a real link to the page with every row, for a reader without script).
 */
export function RosterTable({ data, limit, allHref }: { data: RosterTableData; limit?: number; allHref?: string }) {
  const { say, fmt, locale } = useSpeaker();
  const { lg, cols, lines, names, flags } = data;
  const flagged = useMemo(() => new Set(flags), [flags]);
  const specs = useMemo(() => cols.map((c): ColumnSpec<RosterLine> => {
    const base = { key: c.key, label: c.label, title: c.title };
    switch (c.type) {
      case "nat":
        return { ...base, get: (p) => p[2], cell: (p) => {
          if (!p[2] || !flagged.has(p[2])) return null;
          const name = countryName(p[2], locale);
          return <FlagIcon code={p[2]} name={name} label={say("flag.of", { name })} />;
        } };
      case "player":
        return { ...base, cls: "team", get: (p) => p[1], cell: (p) => <Link href={p[5] ?? playerPath(lg, p[0], p[1])} prefetch={false}>{p[1]}</Link> };
      case "titles":
        return { ...base, num: true, get: (p) => p[3], cell: (p) => (p[3] == null ? "" : fmt(p[3])) };
      case "pos":
        return { ...base, get: (p) => positionsShort(p[4]), cell: (p) => <PositionList items={p[4].map((code) => ({ code, name: names[code] ?? null }))} /> };
      case "posrank":
        return { ...base, get: (p) => p[6][c.slot], cell: (p) => <PositionList items={p[4].map((code) => ({ code, name: names[code] ?? null }))} /> };
      case "stat":
        return { ...base, num: true, get: (p) => p[6][c.slot], cell: (p) => showStat(c.kind, p[6][c.slot], fmt) };
      case "num":
        return { ...base, num: true, get: (p) => p[6][c.slot] };
    }
  }), [cols, lg, names, flagged, locale, say, fmt]);
  const table = useMemo(() => tableOf(lines, specs, (p) => p[0]), [lines, specs]);
  return <SortTable {...table} param={data.param} def={data.def} limit={limit} allHref={allHref} />;
}
