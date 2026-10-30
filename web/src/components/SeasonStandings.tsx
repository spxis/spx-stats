"use client";

import { useMemo } from "react";
import Link from "./Link";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { fmt3 } from "@/lib/format";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import type { SeasonStandFlags, SeasonStandLine } from "@/lib/seasonStandLines";
import { recShare, tableOf, type ColumnSpec, type SortKey } from "@/lib/sort";

/** The words that are the same for every club: the season's label for the games link, and the two badges. */
export interface SeasonStandWords { label: string; winTitle: string; winText: string; defTitle: string; defText: string }

/**
 * A season's standings table, drawn in the browser from the page's lines (lib/seasonStandLines.ts). `head` is how many rows it draws before "Show all"
 * (`perGroup`: of each group, else of the table); every line is in the page already, so pressing it draws the rest at once, and without script it is
 * a link to `allHref`, the same table drawn in full.
 */
export function SeasonStandings({ lg, year, lines, flags, words, groups, def, initial, head, perGroup, allHref }: {
  lg: string; year: number; lines: readonly SeasonStandLine[]; flags: SeasonStandFlags; words: SeasonStandWords;
  groups?: { id: string; title: string; sub?: string }[]; def: string; initial: SortKey[];
  head?: number; perGroup?: boolean; allHref?: string;
}) {
  const { say, fmt } = useSpeaker();
  const paths = usePaths();
  const { place, nhl, showT, showO, showP, showHome, showRoad, maxPct, logos } = flags;
  const table = useMemo(() => {
    const logo = (at: number | undefined) => (at != null && at >= 0 ? logos[at] : null);
    const cols: ColumnSpec<SeasonStandLine>[] = [
      {
        key: "team", label: say("col.team"), cls: "team", get: (r) => r.n,
        cell: (r) => (
          <>
            <TeamLabel lg={lg} f={r.f} name={r.n} year={r.y ? year : undefined} abbr={r.ab} logo={logo(r.lo)} />
            {r.wn ? <span className="defending winner" title={words.winTitle}>{words.winText}</span> : null}
            {r.df ? <span className="defending" title={words.defTitle}>{words.defText}</span> : null}
          </>
        ),
      },
      ...(place ? [{ key: "place", label: say(place as PhraseKey), cls: "place", get: (r: SeasonStandLine) => r.pl ?? "" }] : []),
      ...(nhl ? [{
        key: "nhl", label: say("affil.col"), cls: "team", get: (r: SeasonStandLine) => r.af?.[0]?.[2] ?? "",
        cell: (r: SeasonStandLine) => (r.af ?? []).map(([plg, pf, name, lo]) => <span key={pf} className="affilcell"><TeamLabel lg={plg} f={pf} name={name} logo={logo(lo)} /></span>),
      }] : []),
      {
        key: "gp", label: say("col.gp"), num: true, title: say("col.gpTeamTitle"), get: (r) => r.gp,
        cell: (r) => (r.gp != null && r.g && r.f != null ? (
          <Link href={paths.teamSeason(lg, r.f, year)} prefetch={false} title={say("season.teamGames", { team: r.n ?? "", label: words.label })}>{r.gp}</Link>
        ) : r.gp ?? ""),
      },
      { key: "w", label: say("col.w"), num: true, get: (r) => r.w }, { key: "l", label: say("col.l"), num: true, get: (r) => r.l },
      ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (r: SeasonStandLine) => r.t }] : []),
      ...(showO ? [{ key: "otl", label: say("col.otl"), num: true, get: (r: SeasonStandLine) => r.otl }] : []),
      ...(showP ? [{ key: "pts", label: say("col.pts"), num: true, get: (r: SeasonStandLine) => r.pts }] : []),
      { key: "pf", label: say("col.for"), num: true, get: (r) => r.pf, cell: (r) => (r.pf != null ? fmt(r.pf) : "") },
      { key: "pa", label: say("col.against"), num: true, get: (r) => r.pa, cell: (r) => (r.pa != null ? fmt(r.pa) : "") },
      ...(showHome ? [{ key: "home", label: say("col.home"), get: (r: SeasonStandLine) => recShare(r.home), cell: (r: SeasonStandLine) => r.home || "" }] : []),
      ...(showRoad ? [{ key: "road", label: say("col.road"), get: (r: SeasonStandLine) => recShare(r.road), cell: (r: SeasonStandLine) => r.road || "" }] : []),
      {
        key: "pct", label: say("col.pct"), num: true, get: (r) => r.pct,
        cell: (r) => (
          <>
            {r.pct != null ? fmt3(r.pct) : ""}
            {r.pct != null ? <span className="pctbar" style={{ width: `${Math.round((60 * r.pct) / maxPct)}px` }} /> : null}
          </>
        ),
      },
    ];
    const t = tableOf(lines, cols, (r) => r.id, (r) => r.cl || undefined);
    if (groups) lines.forEach((r, i) => { t.rows[i].group = r.gr; });
    return t;
  }, [lines, say, fmt, paths, lg, year, words, place, nhl, showT, showO, showP, showHome, showRoad, maxPct, logos, groups]);
  return <SortTable {...table} def={def} initial={initial} groups={groups} limit={perGroup ? undefined : head} groupLimit={perGroup ? head : undefined} allHref={allHref} />;
}
