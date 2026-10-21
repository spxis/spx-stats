import Link from "@/components/Link";
import type { ReactNode } from "react";
import { SortTable } from "@/components/SortTable";
import { TeamLabel } from "@/components/TeamLabel";
import type { PositionBook } from "@/components/PositionKey";
import type { Clubs } from "@/lib/allStar";
import { rosterSides, roleRank, type AllStarSelection } from "@/lib/allStarView";
import type { Speaker } from "@/lib/i18n/i18n";
import { tableOf } from "@/lib/sort";
import { roleWord, type PlayerHref } from "./AllStar";

type Say = Speaker["say"];

/** The codes of a roster line's position ("F/G" is two). */
const codesOf = (p: string | null): string[] => (p ? p.split("/").map((x) => x.trim()).filter(Boolean) : []);

/**
 * The players picked, a table for each side (SortTable, so a reader sorts by position, name or club) with the starters, the reserves and the other groups as its sections.
 * A position is drawn through the page's `positionBook()` (the page draws its key once, after every table); a name is a link where the archive knows for certain who the player is, a club
 * has its logo and a link where it is certain which club the line names.
 */
export function Rosters({ lines, lg, say, player, clubs, season, id, book }: {
  lines: readonly AllStarSelection[]; lg: string; say: Say; player: PlayerHref; clubs: Clubs; season: number | null; id: string; book: PositionBook;
}): ReactNode {
  const sides = rosterSides(lines);
  if (!sides.length) return <p className="note">{say("allstar.noRosters")}</p>;
  return (
    <div className="asroster">
      {sides.map((s, k) => {
        const groups = s.groups.map((g) => ({ id: g.role ?? "", title: roleWord(say, g.role) ?? "" })).filter((g) => g.title || s.groups.length > 1);
        const items = s.groups.flatMap((g) => g.players);
        const t = tableOf<AllStarSelection>(items, [
          { key: "pos", label: say("allstar.col.pos"), get: (p) => p.position, cell: (p) => book.list(codesOf(p.position), null, [lg]) },
          { key: "player", label: say("allstar.col.player"), cls: "team", get: (p) => p.name, cell: (p) => (p.person_id != null ? <Link href={player(p.person_id, p.name, lg)}>{p.name}</Link> : p.name) },
          {
            key: "club", label: say("allstar.col.club"), get: (p) => p.team_name,
            cell: (p) => {
              const f = clubs.match(p.team_name, season);
              return f != null ? <TeamLabel lg={lg} f={f} name={p.team_name} logo={clubs.logo(f, season)} year={season ?? undefined} /> : p.team_name ?? "";
            },
          },
        ], (p) => p.seq);
        const roleOfRow = new Map(items.map((p) => [p.seq, p.role ?? ""]));
        t.rows.forEach((r) => { r.group = roleOfRow.get(Number(r.id)) ?? ""; });
        const ordered = [...groups].sort((a, b) => roleRank(a.id || null) - roleRank(b.id || null));
        return (
          <div key={s.side ?? ""} className="asside">
            <h3>{s.side ?? say("allstar.side.none")} <span className="note">{say("allstar.rosterCount", { n: s.count })}</span></h3>
            <div className="tablebox"><SortTable {...t} param={`sort_${id}_${k}`} groups={ordered.length > 1 || ordered[0]?.title ? ordered : undefined} /></div>
          </div>
        );
      })}
    </div>
  );
}
