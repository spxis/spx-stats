"use client";

import Link from "next/link";
import { useMemo } from "react";
import { awardGridPagePath, awardGridRestPath, type AwardColumn, type AwardSeason, type AwardWinner } from "@/lib/awardGrid";
import { seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { useMoreLines } from "./useMoreLines";

/**
 * A league's awards by season: a row a season, a column an award, a cell its winners (or how many, where there are many). The page sends the newest seasons
 * as plain data and the older ones come from the league's `rows/awards` address when "Show all" is pressed or the table is sorted another way (the same
 * arrangement as the champions, components/ChampionsTable.tsx). Without script "Show all" is a link to the full grid as a page of its own.
 */
export function AwardsGrid({ lg, columns, head, logos, total }: { lg: string; columns: AwardColumn[]; head: AwardSeason[]; logos: string[]; total: number }) {
  const { say, plural } = useSpeaker();
  const more = useMoreLines<AwardSeason, { lines?: AwardSeason[]; logos?: string[] }>(awardGridRestPath(lg), head);
  const list = more.body?.logos ?? logos;
  const table = useMemo(() => {
    const winner = (x: AwardWinner) => x.h ? <Link href={x.h} prefetch={false}>{x.w}</Link>
      : x.f != null ? <TeamLabel lg={lg} f={x.f} name={x.w} logo={x.lo != null ? list[x.lo] : null} /> : x.w;
    const specs: ColumnSpec<AwardSeason>[] = [
      { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (s) => s.y, cell: (s) => <Link href={seasonPath(lg, s.y)} prefetch={false}>{seasonLabel(lg, s.y)}</Link> },
      ...columns.map((c): ColumnSpec<AwardSeason> => ({
        key: c.code, label: c.name, cls: "wincell",
        get: (s) => { const w = s.c[c.code]; return w == null ? null : typeof w === "number" ? `~${w}` : w[0]?.w ?? null; },
        cell: (s) => {
          const w = s.c[c.code];
          if (w == null) return null;
          if (typeof w === "number") return <Link href={seasonPath(lg, s.y)} prefetch={false} title={say("awards.openSeason")}>{plural("count.winners", w)}</Link>;
          return w.map((x, i) => <div key={i}>{winner(x)}</div>);
        },
      })),
    ];
    return tableOf(more.lines, specs, (s) => s.y);
  }, [more.lines, say, plural, lg, columns, list]);
  return (
    <SortTable {...table} param="sort_awards" def="season.desc"
      partial={{ total, loaded: more.state === "done" || more.lines.length >= total, state: more.state, load: more.load, href: awardGridPagePath(lg) }} />
  );
}
