import Link from "@/components/Link";
import { ReleaseList } from "@/components/ReleaseList";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { pageMeta } from "@/lib/meta";
import { siteReleaseHead, siteReleaseRest, SITE_RELEASES } from "@/lib/siteReleases";

export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("releases.title"), description: say("releases.metaDesc"), path: "/releases", locale });
}

/** The newest site versions with the feature each shipped; the older ones are a page of their own (page weight). A static list in the code: no database read. */
export default async function ReleasesPage() {
  const { say, dt, fmt } = await currentSpeaker();
  const older = siteReleaseRest().length;
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("releases.eyebrow")}</span>
        <h1>{say("releases.title")}</h1>
        <p className="lede">{say("releases.lede")}</p>
        <p className="note">{say("releases.count", { count: fmt(SITE_RELEASES.length) })} · {say("releases.english")}</p>
      </section>
      <section className="section">
        <ReleaseList rows={siteReleaseHead()} say={say} dt={dt} />
        {older ? <p><Link className="rel-see" href="/releases/older">{say("releases.older", { count: fmt(older) })}</Link></p> : null}
        <p className="note">{say("releases.note")}</p>
      </section>
    </>
  );
}
