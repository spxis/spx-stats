import Link from "@/components/Link";
import { Rich } from "@/components/i18n/Rich";
import { SortTable } from "@/components/SortTable";
import { runsOf } from "@/lib/alignment";
import { getTeamAlignment } from "@/lib/alignmentData";
import { getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { seasonLabel } from "@/lib/leagues";
import { tableOf } from "@/lib/sort";
import "./alignment.css";
import { guard } from "@/lib/loadGuard";

/** A club's conference and division over the years, as unbroken runs of seasons. Draws nothing when none is recorded. */
export const TeamAlignment = guard(async function TeamAlignment({ lg, f }: { lg: string; f: number }) {
  const [rows, summary] = await Promise.all([getTeamAlignment(lg, f), getSummary()]);
  if (!rows.length) return null;
  const { say, plural } = await currentSpeaker();
  const seasons = summary.seasons.filter((s) => s.league === lg).map((s) => s.year).sort((a, b) => a - b);
  const runs = runsOf(rows, seasons).reverse();
  const moves = runs.length - 1;
  const span = (from: number, to: number) => (from === to ? seasonLabel(lg, from) : say("align.span", { from: seasonLabel(lg, from), to: seasonLabel(lg, to) }));
  // The same columns as the names table on this page, so the two read alike: the years (the link), what it was, then Seasons.
  const table = tableOf(runs, [
    {
      key: "years", label: say("col.years"), cls: "seasoncell", get: (r) => r.from,
      cell: (r) => <Link href={`/${lg}/alignment?season=${r.from}`} prefetch={false}>{span(r.from, r.to)}</Link>,
    },
    { key: "conference", label: say("col.conference"), get: (r) => r.conference, cell: (r) => r.conference ?? "" },
    { key: "division", label: say("col.division"), get: (r) => r.division, cell: (r) => r.division ?? "" },
    { key: "seasons", label: say("col.seasons"), num: true, get: (r) => seasons.filter((y) => y >= r.from && y <= r.to).length },
  ], (r) => r.from);
  return (
    <section className="section">
      <h2>{say("align.teamTitle")}</h2>
      <p className="note">
        <Rich text={say("align.teamNote", { changes: moves > 0 ? plural("align.changes", moves) : say("align.teamAlways") })}
          parts={{ link: <Link href={`/${lg}/alignment`} prefetch={false}>{say("align.wholeLeague")}</Link> }} />
      </p>
      <div className="scroll"><SortTable {...table} param="sort_alignment" def="years.desc" /></div>
    </section>
  );
});
