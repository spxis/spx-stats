import { SortTable } from "@/components/SortTable";
import { getSources } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";
import { guard } from "@/lib/loadGuard";

export const revalidate = 3600;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("sources.title"), description: say("sources.metaDesc"), path: "/sources", locale });
}

export default guard(async function SourcesPage() {
  const { say, fmt } = await currentSpeaker();
  const s = await getSources();
  // SPX's own row is made by the site (lib/data.ts), so its words are the site's; the others are the sources' own.
  const own = (code: string, field: "licence" | "notes", given: string | null) => (code === "spx" ? say(field === "licence" ? "sources.spxLicence" : "sources.spxNotes") : given);
  const table = tableOf(s.filter((x) => x.games || x.award_winners), [
    {
      key: "source", label: say("sources.colSource"), cls: "team", get: (x) => x.name,
      cell: (x) => <>{x.url ? <a href={x.url}>{x.name}</a> : x.name}<div className="note">{own(x.code, "notes", x.notes) || ""}</div></>,
    },
    {
      key: "licence", label: say("sources.colLicence"), get: (x) => own(x.code, "licence", x.licence),
      cell: (x) => <>{own(x.code, "licence", x.licence) || ""}{x.attribution ? <div className="note">{x.attribution}</div> : null}</>,
    },
    { key: "games", label: say("sources.colGames"), num: true, get: (x) => x.games, cell: (x) => fmt(x.games) },
    { key: "winners", label: say("sources.colWinners"), num: true, get: (x) => x.award_winners, cell: (x) => fmt(x.award_winners) },
  ], (x) => x.code);
  return (
    <>
      <section className="head fade">
        <h1>{say("sources.title")}</h1>
        <p className="lede">{say("sources.lede")}</p>
      </section>
      <section className="section scroll">
        <SortTable {...table} />
      </section>
    </>
  );
});
