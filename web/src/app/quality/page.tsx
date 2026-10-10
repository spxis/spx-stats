import { Badge, Figures } from "@/components/ui";
import { getQuality } from "@/lib/data";
import { fmt } from "@/lib/format";
import { LG } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";

export const revalidate = 3600;
export const metadata = pageMeta({
  title: "Data quality",
  description: "Every change to what a source said is logged, and every value a second source checks gets a mark.",
  path: "/quality",
});

export default async function QualityPage() {
  const q = await getQuality();
  const total = (status: string) => q.checks.filter((c) => c.status === status).reduce((a, c) => a + c.n, 0);
  return (
    <>
      <section className="head fade">
        <h1>Data quality</h1>
        <p className="lede">Every change to what a source said is logged, and every value a second source checks gets a mark.</p>
      </section>
      <Figures items={[["Confirmed by a second source", total("confirmed")], ["Disputed", total("disputed")], ["Logged issues", q.issues.reduce((a, i) => a + i.n, 0)]]} />
      <section className="section">
        <h2>Where each league&apos;s games come from</h2>
        <table>
          <thead><tr><th>League</th><th>Source</th><th className="num">Games</th></tr></thead>
          <tbody>
            {q.games_by_source.map((r) => (
              <tr key={`${r.league}|${r.source}`}>
                <td>{LG[r.league as keyof typeof LG] ?? r.league}</td>
                <td><Badge src={r.source} /></td>
                <td className="num">{fmt(r.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="section">
        <h2>Logged issues</h2>
        <div className="tablebox">
          <table>
            <thead><tr><th>Issue</th><th>What was done</th><th>Source</th><th className="num">Count</th></tr></thead>
            <tbody>
              {q.issues.map((i) => (
                <tr key={`${i.source}|${i.kind}|${i.issue}|${i.resolution}`}>
                  <td>{i.issue}</td><td className="note">{i.resolution}</td><td><Badge src={i.source} /></td><td className="num">{fmt(i.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
