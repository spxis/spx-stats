import { CoachMoves } from "@/components/CoachMoves";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";

// Kept and revalidated every day. The league and the decade are read from the address in the browser, so the page reads no query
// (and ?lg= ?dec= are not in QUERY_KEYS, lib/routing.ts).
export const revalidate = 2592000;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("coaches.title"), description: say("coaches.metaDesc"), path: "/teams/coaches", locale });
}

export default guard(async function CoachesPage() {
  const { say } = await currentSpeaker();
  return (
    <>
      <section className="head fade">
        <h1>{say("coaches.title")}</h1>
        <p className="lede">{say("coaches.lede")}</p>
      </section>
      <section className="section">
        <CoachMoves />
      </section>
    </>
  );
});
