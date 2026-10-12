import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import type { LeagueAwardRow } from "@/lib/api/people";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { seasonLabel } from "@/lib/leagues";
import { getLeagueAwards } from "@/lib/people";
import { getPlayerPaths } from "@/lib/playerLinks";
import { tableOf } from "@/lib/sort";
import "@/components/people.css";
import { seasonPath } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";
import { guard } from "@/lib/loadGuard";

interface Season { year: number; by: Map<string, LeagueAwardRow[]> }
const MANY = 4;

/** Every award by season: a row a season, a column an award, a cell its winners (or how many, where there are many). */
export const LeagueAwards = guard(async function LeagueAwards({ lg }: { lg: string }) {
  const [list, paths, player] = await Promise.all([getLeagueAwards(lg), getPaths(), getPlayerPaths()]);
  if (!list.length) return null;
  const { say, plural } = await currentSpeaker();
  const cols = new Map<string, { code: string; name: string; kind: string; n: number }>();
  const seasons = new Map<number, Season>();
  for (const a of list) {
    const c = cols.get(a.award_code) ?? cols.set(a.award_code, { code: a.award_code, name: a.award, kind: a.kind, n: 0 }).get(a.award_code)!;
    c.n += 1;
    const s = seasons.get(a.year) ?? seasons.set(a.year, { year: a.year, by: new Map() }).get(a.year)!;
    const w = s.by.get(a.award_code) ?? s.by.set(a.award_code, []).get(a.award_code)!;
    w.push(a);
  }
  const order = [...cols.values()].sort((a, b) => (a.kind === b.kind ? b.n - a.n : a.kind === "person_award" ? -1 : 1));
  const t = tableOf([...seasons.values()].sort((a, b) => b.year - a.year), [
    { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (s) => s.year, cell: (s) => <Link href={seasonPath(lg, s.year)} prefetch={false}>{seasonLabel(lg, s.year)}</Link> },
    ...order.map((c) => ({
      key: c.code, label: c.name, cls: "wincell",
      get: (s: Season) => { const w = s.by.get(c.code); return w ? (w.length > MANY ? `~${w.length}` : w[0].winner) : null; },
      cell: (s: Season) => {
        const w = s.by.get(c.code) ?? [];
        if (w.length > MANY) return <Link href={seasonPath(lg, s.year)} prefetch={false} title={say("awards.openSeason")}>{plural("count.winners", w.length)}</Link>;
        return w.map((x, i) => (
          <div key={i}>
            {x.person_id != null ? <Link href={player(x.person_id, x.winner ?? "", lg)} prefetch={false}>{x.winner}</Link>
              : x.franchise_id != null ? <Link href={paths.team(lg, x.franchise_id)} prefetch={false}>{x.winner}</Link> : x.winner}
          </div>
        ));
      },
    })),
  ], (s) => s.year);
  return (
    <section className="section">
      <h2>{say("awards.bySeason")}</h2>
      <p className="note">{say("awards.bySeasonNote", { winners: plural("count.awardWinners", list.length), seasons: plural("count.seasons", seasons.size) })}</p>
      <div className="tablebox awardsgrid"><SortTable {...t} param="sort_awards" def="season.desc" /></div>
    </section>
  );
});
