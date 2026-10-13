import Link from "next/link";
import { Rich } from "@/components/i18n/Rich";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { pageMeta } from "@/lib/meta";

export const revalidate = 3600;

const UPDATED = new Date("2026-10-11");

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("about.title"), description: say("about.metaDesc"), path: "/about", locale });
}

export default async function AboutPage() {
  const { say, dt } = await currentSpeaker();
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("about.eyebrow")}</span>
        <h1>{say("about.title")}</h1>
        <p className="lede">{say("about.lede")}</p>
      </section>
      <section className="section prose">
        <h2>{say("about.whatTitle")}</h2>
        <p>{say("about.what")}</p>
        <h2>{say("about.dataTitle")}</h2>
        <p>{say("about.base")}</p>
        <p>{say("about.gaps")}</p>
        <p>{say("about.checks")}</p>
        <p>{say("about.holes")}</p>
        <p>
          <Rich text={say("about.more")} parts={{
            sources: <Link href="/sources">{say("nav.sources")}</Link>,
            quality: <Link href="/quality">{say("nav.quality")}</Link>,
            logos: <Link href="/logos">{say("nav.logos")}</Link>,
          }} />
        </p>
        <h2>{say("about.ownerTitle")}</h2>
        <p>{say("about.owner")}</p>
        <h2>{say("about.contactTitle")}</h2>
        <p><Rich text={say("about.contact")} parts={{ link: <a href="https://github.com/spxis/spx-stats/issues">{say("about.contactLink")}</a> }} /></p>
        <p className="note">{say("legal.updated", { date: dt.ymd(UPDATED) })}</p>
      </section>
    </>
  );
}
