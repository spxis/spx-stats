"use client";

import { useMemo } from "react";
import Link from "./Link";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { atUtc } from "@/lib/format";
import { gamePath } from "@/lib/gamePath";
import { tableOf, type ColumnSpec } from "@/lib/sort";

/**
 * One postseason game as the page sends it: its id, day, name and group, and its two sides in the game's own order (the visitor first): franchise, name, score
 * (0 when none) and the place of its logo in the page's list.
 */
type Side = [f: number | null, name: string, score: number, logo: number];
export interface PostLine { id: number; d: string; n: string; k: string; a: Side; b: Side }

/** The winner and the loser: the side with more points wins. */
const sides = (r: PostLine): [Side, Side] => (r.b[2] > r.a[2] ? [r.b, r.a] : [r.a, r.b]);

/** A season's postseason table, drawn in the browser from the page's lines (every game is in the page's markup too, once, for readers without script). */
export function PostseasonTable({ lg, year, lines, logos, groups }: {
  lg: string; year: number; lines: readonly PostLine[]; logos: readonly string[]; groups: { id: string; title: string; sub?: string }[];
}) {
  const { say, fmt, dt } = useSpeaker();
  const table = useMemo(() => {
    const logo = (at: number) => (at >= 0 ? logos[at] : null);
    const cols: ColumnSpec<PostLine>[] = [
      { key: "game", label: say("post.col.game"), cls: "team", get: (r) => r.n, cell: (r) => <Link href={gamePath(lg, year, r.id, r.a[1], r.b[1])} prefetch={false}>{r.n}</Link> },
      { key: "date", label: say("col.date"), get: (r) => r.d, cell: (r) => dt.monthDayShort(atUtc(r.d)) },
      { key: "winner", label: say("post.col.winner"), cls: "team", get: (r) => sides(r)[0][1], cell: (r) => { const w = sides(r)[0]; return <TeamLabel lg={lg} f={w[0]} name={w[1]} year={year} logo={logo(w[3])} />; } },
      { key: "score", label: say("col.score"), num: true, get: (r) => Math.max(r.a[2], r.b[2]), cell: (r) => `${fmt(Math.max(r.a[2], r.b[2]))}–${fmt(Math.min(r.a[2], r.b[2]))}` },
      { key: "loser", label: say("post.col.loser"), cls: "team", get: (r) => sides(r)[1][1], cell: (r) => { const l = sides(r)[1]; return <TeamLabel lg={lg} f={l[0]} name={l[1]} year={year} logo={logo(l[3])} />; } },
    ];
    const t = tableOf(lines, cols, (r) => r.id);
    t.rows.forEach((r, i) => { r.group = lines[i].k; });
    return t;
  }, [lines, logos, say, fmt, dt, lg, year]);
  return <SortTable {...table} param="sort_post" groups={groups} />;
}
