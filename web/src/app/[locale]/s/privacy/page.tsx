import { Rich } from "@/components/i18n/Rich";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { pageMeta } from "@/lib/meta";

export const revalidate = 86400;

const UPDATED = new Date("2026-10-11");

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("privacy.title"), description: say("privacy.metaDesc"), path: "/privacy", locale });
}

export default async function PrivacyPage() {
  const { say, dt } = await currentSpeaker();
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("privacy.eyebrow")}</span>
        <h1>{say("privacy.title")}</h1>
        <p className="lede">{say("privacy.lede")}</p>
      </section>
      <section className="section prose">
        <h2>{say("privacy.accountsTitle")}</h2>
        <p>{say("privacy.accounts")}</p>
        <h2>{say("privacy.cookiesTitle")}</h2>
        <ul>
          <li>{say("privacy.cookie")}</li>
          <li>{say("privacy.theme")}</li>
          <li>{say("privacy.browserLanguage")}</li>
        </ul>
        <h2>{say("privacy.trackingTitle")}</h2>
        <p>{say("privacy.tracking")}</p>
        <h2>{say("privacy.visitsTitle")}</h2>
        <p>{say("privacy.visits")}</p>
        <h2>{say("privacy.logosTitle")}</h2>
        <p>{say("privacy.logos")}</p>
        <h2>{say("privacy.hostTitle")}</h2>
        <p><Rich text={say("privacy.host")} parts={{ link: <a href="https://vercel.com/legal/privacy-policy">{say("privacy.hostLink")}</a> }} /></p>
        <p>{say("privacy.database")}</p>
        <h2>{say("privacy.questionsTitle")}</h2>
        <p><Rich text={say("privacy.questions")} parts={{ link: <a href="https://github.com/spxis/spx-stats/issues">{say("about.contactLink")}</a> }} /></p>
        <p>{say("privacy.notLegal")}</p>
        <p className="note">{say("legal.updated", { date: dt.ymd(UPDATED) })}</p>
      </section>
    </>
  );
}
