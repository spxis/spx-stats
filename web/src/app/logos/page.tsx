import { rollups } from "d3";
import { SortTable } from "@/components/SortTable";
import { getBrands } from "@/lib/data";
import { fmt } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";

export const revalidate = 3600;
export const metadata = pageMeta({
  title: "Team logos",
  description: "Why SPXN shows team logos, where they come from, and how to ask for one to be removed.",
  path: "/logos",
});

export default async function LogosPage() {
  const brands = await getBrands();
  const list = Object.values(brands).flat().filter((b) => b.logo_url);
  const kinds = rollups(list, (v) => v.length, (b) => b.logo_licence || "Not recorded").sort((a, b) => b[1] - a[1]);
  const table = tableOf(kinds, [
    { key: "licence", label: "Licence given by the file page", get: (k) => k[0] },
    { key: "logos", label: "Logos", num: true, get: (k) => k[1], cell: (k) => fmt(k[1]) },
  ], (k) => k[0]);
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">About the logos</span>
        <h1>Team logos</h1>
        <p className="lede">Why this site shows team logos, where they come from, and how to ask for one to be removed.</p>
      </section>
      <section className="section prose">
        <h2>They belong to their owners</h2>
        <p>Every team and league logo shown here is a trademark, and often a copyrighted work, of its team or league. SPXN is not affiliated with, sponsored by or endorsed by any team or league, and claims no rights in their logos.</p>
        <h2>Why we show them</h2>
        <p>SPXN is a historical record of five leagues: scores, standings, champions and awards back to the 1870s. A small logo beside a name lets a reader recognize a team at a glance, the way a logo appears in a newspaper standings table. We use them for that alone: to identify the team being described, in a reference work about the sport’s history.</p>
        <p>We believe this is fair use (in Canada, fair dealing for research, education and reporting): the logos are shown small and unaltered, only beside the team they name, never to sell anything, never in a way that suggests a team endorses this site, and they do not replace any market for the logos themselves. Sports reference sites have used logos on the same basis for many years.</p>
        <h2>Where they come from</h2>
        <p>Logos are taken from Wikimedia Commons, through each team’s Wikidata entry, and shown from Commons’ own servers. Each logo keeps the licence its file page gives it. Some simple text logos are in the public domain for copyright, but remain trademarks.</p>
        {kinds.length ? (
          <SortTable {...table} />
        ) : <p className="note">No logos are loaded yet.</p>}
        <h2>Team colours</h2>
        <p>Team pages take the team’s colours. Colours are facts, not anyone’s property; ours come from Wikidata (CC0).</p>
        <h2>Asking for removal</h2>
        <p>If you own a logo shown here and want it removed, tell us and it will be taken down promptly, no questions asked: <a href="https://github.com/spxis/spx-stats/issues">open an issue</a>.</p>
      </section>
    </>
  );
}
