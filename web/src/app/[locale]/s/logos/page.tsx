import { rollups } from "d3";
import { Rich } from "@/components/i18n/Rich";
import { SortTable } from "@/components/SortTable";
import { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { tableOf } from "@/lib/sort";

export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("logos.title"), description: say("logos.metaDesc"), path: "/logos", locale });
}

export default guard(async function LogosPage() {
  const { say, fmt } = await currentSpeaker();
  const brands = await getBrands();
  const list = Object.values(brands).flat().filter((b) => b.logo_url);
  const kinds = rollups(list, (v) => v.length, (b) => b.logo_licence || say("logos.notRecorded")).sort((a, b) => b[1] - a[1]);
  const table = tableOf(kinds, [
    { key: "licence", label: say("logos.colLicence"), get: (k) => k[0] },
    { key: "logos", label: say("logos.colLogos"), num: true, get: (k) => k[1], cell: (k) => fmt(k[1]) },
  ], (k) => k[0]);
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("logos.eyebrow")}</span>
        <h1>{say("logos.title")}</h1>
        <p className="lede">{say("logos.lede")}</p>
      </section>
      <section className="section prose">
        <h2>{say("logos.ownersTitle")}</h2>
        <p>{say("logos.owners")}</p>
        <h2>{say("logos.whyTitle")}</h2>
        <p>{say("logos.why")}</p>
        <p>{say("logos.fair")}</p>
        <h2>{say("logos.sourceTitle")}</h2>
        <p>{say("logos.source")}</p>
        {kinds.length ? (
          <SortTable {...table} />
        ) : <p className="note">{say("logos.none")}</p>}
        <h2>{say("logos.coloursTitle")}</h2>
        <p>{say("logos.colours")}</p>
        <h2>{say("logos.removalTitle")}</h2>
        <p><Rich text={say("logos.removal")} parts={{ link: <a href="https://github.com/spxis/spx-stats/issues">{say("logos.openIssue")}</a> }} /></p>
      </section>
    </>
  );
});
