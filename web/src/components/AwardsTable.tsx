"use client";

import Link from "@/components/Link";
import { useMemo } from "react";
import { trophyPath } from "@/lib/awardTrophy";
import { awardPagePath, awardRestPath, type AwardLine } from "@/lib/awardLines";
import { seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { AwardCup } from "./TrophyIcon";
import { SortTable } from "./SortTable";
import { TeamLogo } from "./TeamLogo";
import { useMoreLines } from "./useMoreLines";

/**
 * The awards a franchise and its players won. The page sends the newest as plain data and the older come from the franchise's `rows/awards` address
 * when "Show all" is pressed or the table is sorted another way (the same arrangement as the standings, components/StandingsTable.tsx).
 */
export function AwardsTable({ lg, teamPath, head, logos, total }: { lg: string; teamPath: string; head: AwardLine[]; logos: string[]; total: number }) {
  const { say } = useSpeaker();
  const more = useMoreLines<AwardLine>(awardRestPath(teamPath), head);
  const table = useMemo(() => tableOf(more.lines, [
    { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (r) => r.y, cell: (r) => <Link href={seasonPath(lg, r.y)} prefetch={false}>{seasonLabel(lg, r.y)}</Link> },
    { key: "award", label: say("col.award"), get: (r) => r.a, cell: (r) => (r.c ? <Link href={trophyPath(r.c)} prefetch={false}>{r.a}</Link> : r.a) },
    { key: "winner", label: say("col.wonBy"), cls: "team wincell", get: (r) => r.w ?? null, cell: (r) => <span className="awardwin"><AwardCup league={lg} />{r.h ? <Link href={r.h} prefetch={false}>{r.w}</Link> : <><TeamLogo url={r.lo != null ? logos[r.lo] : null} />{r.w}</>}</span> },
    { key: "kind", label: "", get: (r) => (r.p ? say("awards.badgePlayer") : say("awards.badgeTeam")), cell: (r) => <span className="badge">{r.p ? say("awards.badgePlayer") : say("awards.badgeTeam")}</span> },
  ], (_r, i) => i), [more.lines, say, lg, logos]);
  return (
    <SortTable {...table} param="sort_awards" def="season.desc"
      partial={{ total, loaded: more.state === "done" || more.lines.length >= total, state: more.state, load: more.load, href: awardPagePath(teamPath) }} />
  );
}
