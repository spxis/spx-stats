import Link from "@/components/Link";
import { ReleaseList } from "@/components/ReleaseList";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { pageMeta } from "@/lib/meta";
import { siteReleaseRest } from "@/lib/siteReleases";

export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("releases.olderTitle"), description: say("releases.metaDesc"), path: "/releases/older", locale });
}

/** The versions below the newest ones on /releases. */
export default async function OlderReleasesPage() {
  const { say, dt } = await currentSpeaker();
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("releases.eyebrow")}</span>
        <h1>{say("releases.olderTitle")}</h1>
        <p className="lede"><Link className="rel-see" href="/releases">{say("releases.back")}</Link></p>
      </section>
      <section className="section">
        <ReleaseList rows={siteReleaseRest()} say={say} dt={dt} />
      </section>
    </>
  );
}
