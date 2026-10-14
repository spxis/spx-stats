import { FranchiseLineage } from "@/components/FranchiseLineage";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard } from "@/lib/loadGuard";
import { getLineage } from "@/lib/lineageData";
import { pageMeta } from "@/lib/meta";

// Kept and revalidated every day. The league, decade and "changed name" choices are read from the address in the browser, so the page
// reads no query (and ?lg= ?dec= ?chg= are not in QUERY_KEYS, lib/routing.ts).
export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("lineage.title"), description: say("lineage.metaDesc"), path: "/teams/lineage", locale });
}

export default guard(async function LineagePage() {
  const { say } = await currentSpeaker();
  const data = await getLineage();
  return (
    <>
      <section className="head fade">
        <h1>{say("lineage.title")}</h1>
        <p className="lede">{say("lineage.lede")}</p>
      </section>
      <section className="section">
        <FranchiseLineage franchises={data.franchises} omitted={data.omitted} />
      </section>
    </>
  );
});
