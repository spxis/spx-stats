import { SortTable } from "@/components/SortTable";
import { Badge, Figures } from "@/components/ui";
import { getQuality } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, srcName } from "@/lib/leagues";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import { guard } from "@/lib/loadGuard";

export const revalidate = 3600;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("quality.title"), description: say("quality.lede"), path: "/quality", locale });
}

export default guard(async function QualityPage() {
  const { say, fmt } = await currentSpeaker();
  const q = await getQuality();
  const total = (status: string) => q.checks.filter((c) => c.status === status).reduce((a, c) => a + c.n, 0);
  const bySource = tableOf(q.games_by_source, [
    { key: "league", label: say("quality.colLeague"), get: (r) => LG[r.league as keyof typeof LG] ?? r.league },
    { key: "source", label: say("quality.colSource"), get: (r) => srcName(say, r.source), cell: (r) => <Badge src={r.source} /> },
    { key: "games", label: say("quality.colGames"), num: true, get: (r) => r.n, cell: (r) => fmt(r.n) },
  ], (r) => `${r.league}|${r.source}`);
  const issues = tableOf(q.issues, [
    { key: "issue", label: say("quality.colIssue"), get: (i) => i.issue },
    { key: "resolution", label: say("quality.colResolution"), cls: "note", get: (i) => i.resolution },
    { key: "source", label: say("quality.colSource"), get: (i) => srcName(say, i.source), cell: (i) => <Badge src={i.source} /> },
    { key: "count", label: say("quality.colCount"), num: true, get: (i) => i.n, cell: (i) => fmt(i.n) },
  ], (i) => `${i.source}|${i.kind}|${i.issue}|${i.resolution}`);
  return (
    <>
      <section className="head fade">
        <h1>{say("quality.title")}</h1>
        <p className="lede">{say("quality.lede")}</p>
      </section>
      <Figures items={[[say("home.confirmed"), total("confirmed")], [say("quality.disputed"), total("disputed")], [say("quality.logged"), q.issues.reduce((a, i) => a + i.n, 0)]]} />
      <section className="section">
        <h2>{say("quality.bySourceTitle")}</h2>
        <div className="scroll"><SortTable {...bySource} param="sort_games" /></div>
      </section>
      <section className="section">
        <h2>{say("quality.issuesTitle")}</h2>
        <div className="tablebox">
          <SortTable {...issues} param="sort_issues" />
        </div>
      </section>
    </>
  );
});
