import Link from "next/link";
import { SortTable } from "@/components/SortTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { getTeamAwards } from "@/lib/people";
import { seasonLabel } from "@/lib/leagues";
import { tableOf } from "@/lib/sort";

/** The awards a franchise won and its players won while on it, newest first; nothing at all when there are none. */
export async function TeamAwards({ lg, f }: { lg: string; f: number }) {
  const list = await getTeamAwards(lg, f);
  if (!list.length) return null;
  const { say, plural } = await currentSpeaker();
  const badge = (kind: string) => (kind === "person_award" ? say("awards.badgePlayer") : say("awards.badgeTeam"));
  const t = tableOf(list, [
    { key: "season", label: say("col.season"), num: true, cls: "seasoncell", get: (r) => r.year, cell: (r) => <Link href={`/${lg}/${r.year}`} prefetch={false}>{seasonLabel(lg, r.year)}</Link> },
    { key: "award", label: say("col.award"), get: (r) => r.award },
    { key: "winner", label: say("col.wonBy"), cls: "team", get: (r) => r.winner, cell: (r) => (r.person_id != null ? <Link href={`/players/${r.person_id}`} prefetch={false}>{r.winner}</Link> : r.winner) },
    { key: "kind", label: "", get: (r) => badge(r.kind), cell: (r) => <span className="badge">{badge(r.kind)}</span> },
  ], (r, i) => `${r.award_code}|${r.year}|${i}`);
  return (
    <section className="section">
      <h2>{say("awards.title")}</h2>
      <p className="note">{say("awards.teamNote", { awards: plural("count.awards", list.length) })}</p>
      <div className="tablebox"><SortTable {...t} param="sort_awards" def="season.desc" /></div>
    </section>
  );
}
