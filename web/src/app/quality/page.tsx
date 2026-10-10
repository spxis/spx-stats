import { SortTable } from "@/components/SortTable";
import { Badge, Figures } from "@/components/ui";
import { getQuality } from "@/lib/data";
import { fmt } from "@/lib/format";
import { LG, SRC } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";

export const revalidate = 3600;
export const metadata = pageMeta({
  title: "Data quality",
  description: "Every change to what a source said is logged, and every value a second source checks gets a mark.",
  path: "/quality",
});

export default async function QualityPage() {
  const q = await getQuality();
  const total = (status: string) => q.checks.filter((c) => c.status === status).reduce((a, c) => a + c.n, 0);
  const bySource = tableOf(q.games_by_source, [
    { key: "league", label: "League", get: (r) => LG[r.league as keyof typeof LG] ?? r.league },
    { key: "source", label: "Source", get: (r) => SRC[r.source] || r.source, cell: (r) => <Badge src={r.source} /> },
    { key: "games", label: "Games", num: true, get: (r) => r.n, cell: (r) => fmt(r.n) },
  ], (r) => `${r.league}|${r.source}`);
  const issues = tableOf(q.issues, [
    { key: "issue", label: "Issue", get: (i) => i.issue },
    { key: "resolution", label: "What was done", cls: "note", get: (i) => i.resolution },
    { key: "source", label: "Source", get: (i) => SRC[i.source] || i.source, cell: (i) => <Badge src={i.source} /> },
    { key: "count", label: "Count", num: true, get: (i) => i.n, cell: (i) => fmt(i.n) },
  ], (i) => `${i.source}|${i.kind}|${i.issue}|${i.resolution}`);
  return (
    <>
      <section className="head fade">
        <h1>Data quality</h1>
        <p className="lede">Every change to what a source said is logged, and every value a second source checks gets a mark.</p>
      </section>
      <Figures items={[["Confirmed by a second source", total("confirmed")], ["Disputed", total("disputed")], ["Logged issues", q.issues.reduce((a, i) => a + i.n, 0)]]} />
      <section className="section">
        <h2>Where each league&apos;s games come from</h2>
        <div className="scroll"><SortTable {...bySource} param="sort_games" /></div>
      </section>
      <section className="section">
        <h2>Logged issues</h2>
        <div className="tablebox">
          <SortTable {...issues} param="sort_issues" />
        </div>
      </section>
    </>
  );
}
