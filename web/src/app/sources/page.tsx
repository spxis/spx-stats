import { getSources } from "@/lib/data";
import { fmt } from "@/lib/format";
import { pageMeta } from "@/lib/meta";

export const revalidate = 3600;
export const metadata = pageMeta({
  title: "Sources",
  description: "Where SPXN's games, standings and awards come from, with the licence and credit of each source.",
  path: "/sources",
});

export default async function SourcesPage() {
  const s = await getSources();
  return (
    <>
      <section className="head fade">
        <h1>Sources</h1>
        <p className="lede">SPX&apos;s own data is the base wherever SPX holds it. Open sources fill what SPX never had and check what it did.</p>
      </section>
      <section className="section scroll">
        <table>
          <thead><tr><th>Source</th><th>Licence and credit</th><th className="num">Games</th><th className="num">Award winners</th></tr></thead>
          <tbody>
            {s.filter((x) => x.games || x.award_winners).map((x) => (
              <tr key={x.code}>
                <td className="team">
                  {x.url ? <a href={x.url}>{x.name}</a> : x.name}
                  <div className="note">{x.notes || ""}</div>
                </td>
                <td>{x.licence || ""}{x.attribution ? <div className="note">{x.attribution}</div> : null}</td>
                <td className="num">{fmt(x.games)}</td>
                <td className="num">{fmt(x.award_winners)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
