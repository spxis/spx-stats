import { SortTable } from "@/components/SortTable";
import { getSources } from "@/lib/data";
import { fmt } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";

export const revalidate = 3600;
export const metadata = pageMeta({
  title: "Sources",
  description: "Where SPXN's games, standings and awards come from, with the licence and credit of each source.",
  path: "/sources",
});

export default async function SourcesPage() {
  const s = await getSources();
  const table = tableOf(s.filter((x) => x.games || x.award_winners), [
    {
      key: "source", label: "Source", cls: "team", get: (x) => x.name,
      cell: (x) => <>{x.url ? <a href={x.url}>{x.name}</a> : x.name}<div className="note">{x.notes || ""}</div></>,
    },
    {
      key: "licence", label: "Licence and credit", get: (x) => x.licence,
      cell: (x) => <>{x.licence || ""}{x.attribution ? <div className="note">{x.attribution}</div> : null}</>,
    },
    { key: "games", label: "Games", num: true, get: (x) => x.games, cell: (x) => fmt(x.games) },
    { key: "winners", label: "Award winners", num: true, get: (x) => x.award_winners, cell: (x) => fmt(x.award_winners) },
  ], (x) => x.code);
  return (
    <>
      <section className="head fade">
        <h1>Sources</h1>
        <p className="lede">SPX&apos;s own data is the base wherever SPX holds it. Open sources fill what SPX never had and check what it did.</p>
      </section>
      <section className="section scroll">
        <SortTable {...table} />
      </section>
    </>
  );
}
