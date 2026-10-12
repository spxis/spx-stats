import Link from "next/link";
import { Rich } from "@/components/i18n/Rich";
import { runsOf } from "@/lib/alignment";
import { getTeamAlignment } from "@/lib/alignmentData";
import { getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { seasonLabel } from "@/lib/leagues";
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
  const span = (from: number, to: number) => (from === to ? seasonLabel(lg, from) : say("align.spanCount", {
    span: say("align.span", { from: seasonLabel(lg, from), to: seasonLabel(lg, to) }),
    seasons: plural("count.seasons", seasons.filter((y) => y >= from && y <= to).length),
  }));
  return (
    <section className="section">
      <h2>{say("align.teamTitle")}</h2>
      <p className="note">
        <Rich text={say("align.teamNote", { changes: moves > 0 ? plural("align.changes", moves) : say("align.teamAlways") })}
          parts={{ link: <Link href={`/${lg}/alignment`} prefetch={false}>{say("align.wholeLeague")}</Link> }} />
      </p>
      <div className="scroll">
        <table className="history">
          <thead><tr><th scope="col">{say("col.seasons")}</th><th scope="col">{say("col.conference")}</th><th scope="col">{say("col.division")}</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.from}>
                <td className="span"><Link href={`/${lg}/alignment?season=${r.from}`} prefetch={false}>{span(r.from, r.to)}</Link></td>
                <td>{r.conference ?? ""}</td>
                <td>{r.division ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});
