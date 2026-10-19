"use client";

import Link from "@/components/Link";
import { useMemo } from "react";
import { trophyPath, trophyRowsPath, type TrophyLine } from "@/lib/awardTrophy";
import { seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { useMoreLines } from "./useMoreLines";

/**
 * Every winner of one trophy, season by season. The page sends the newest as plain data and the older come from the trophy's `rows` address when "Show all" is
 * pressed or the table is sorted another way (the same arrangement as the awards of a league, components/AwardsGrid.tsx). Without script "Show all" is a link to
 * the trophy's own page. `team` says the winners are clubs (a championship or a team award): the name is then the team and there is no team column.
 */
export function TrophyWinners({ lg, code, team, hasTeam, hasNote, head, logos, total }: {
  lg: string; code: string; team: boolean; hasTeam: boolean; hasNote: boolean; head: TrophyLine[]; logos: string[]; total: number;
}) {
  const { say } = useSpeaker();
  const more = useMoreLines<TrophyLine, { lines?: TrophyLine[]; logos?: string[] }>(trophyRowsPath(code), head);
  const list = more.body?.logos ?? logos;
  const table = useMemo(() => {
    const club = (l: TrophyLine) => <TeamLabel lg={lg} f={l.f} name={l.w} logo={l.lo != null ? list[l.lo] : null} year={l.y} />;
    return tableOf(more.lines, [
      { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (l) => l.y, cell: (l) => <Link href={seasonPath(lg, l.y)} prefetch={false}>{seasonLabel(lg, l.y)}</Link> },
      {
        key: "winner", label: say(team ? "col.team" : "trophies.col.who"), cls: "team wincell", get: (l) => l.w ?? null,
        cell: (l) => (team && l.f != null ? club(l) : l.h ? <Link href={l.h} prefetch={false}>{l.w}</Link> : l.w ?? null),
      },
      ...(hasTeam && !team ? [{ key: "team", label: say("trophies.col.team"), cls: "team", get: (l: TrophyLine) => l.f ?? null, cell: (l: TrophyLine) => (l.f != null ? club({ ...l, w: l.t }) : null) }] : []),
      ...(hasNote ? [{ key: "note", label: say("trophies.col.details"), get: (l: TrophyLine) => l.n ?? null }] : []),
    ], (_l, i) => i);
  }, [more.lines, say, lg, team, hasTeam, hasNote, list]);
  return (
    <SortTable {...table} param="sort_awards" def="season.desc"
      partial={{ total, loaded: more.state === "done" || more.lines.length >= total, state: more.state, load: more.load, href: trophyPath(code) }} />
  );
}
