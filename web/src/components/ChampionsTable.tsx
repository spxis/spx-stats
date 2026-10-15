"use client";

import Link from "next/link";
import { useMemo } from "react";
import { champNoteText, champPagePath, champRestPath, type ChampLine } from "@/lib/champLines";
import { seasonLabel, srcName } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { Badge } from "./ui";
import { useMoreLines } from "./useMoreLines";

/**
 * A league's champions, season by season. The page sends the newest seasons as plain data (so they are in the page for readers and search once, not twice
 * as markup and payload) and the older ones come from the league's `rows/champions` address when "Show all" is pressed or the table is sorted another
 * way (the same arrangement as a franchise's standings, components/StandingsTable.tsx). Without script "Show all" is a link to the full list as a page of its own.
 */
export function ChampionsTable({ lg, head, logos, total }: { lg: string; head: ChampLine[]; logos: string[]; total: number }) {
  const { say } = useSpeaker();
  const more = useMoreLines<ChampLine, { lines?: ChampLine[]; logos?: string[] }>(champRestPath(lg), head);
  const list = more.body?.logos ?? logos;
  const table = useMemo(() => tableOf(more.lines, [
    {
      key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (c) => c.y,
      cell: (c) => <Link href={seasonPath(lg, c.y)} prefetch={false}>{seasonLabel(lg, c.y)}</Link>,
    },
    {
      key: "champion", label: say("col.champion"), cls: "team", get: (c) => c.team ?? null,
      cell: (c) => <TeamLabel lg={lg} f={c.f} name={c.team} logo={c.lo != null ? list[c.lo] : null} />,
    },
    {
      key: "final", label: say("col.final"), cls: "note", get: (c) => champNoteText(c) || null,
      cell: (c) => c.fin ? (
        <>
          {c.fin.a}
          <Link href={c.fin.h} prefetch={false} title="The whole series, game by game">{c.fin.s}</Link>
          {c.fin.m}
          <TeamLabel lg={lg} f={c.fin.of} name={c.fin.o} year={c.y} logo={c.fin.ol != null ? list[c.fin.ol] : null} />
        </>
      ) : c.note ?? "",
    },
    { key: "source", label: say("col.source"), get: (c) => (c.src ? srcName(say, c.src) : null), cell: (c) => <Badge src={c.src} /> },
  ], (c) => c.y), [more.lines, say, lg, list]);
  return (
    <SortTable {...table} def="season.desc"
      partial={{ total, loaded: more.state === "done" || more.lines.length >= total, state: more.state, load: more.load, href: champPagePath(lg) }} />
  );
}
