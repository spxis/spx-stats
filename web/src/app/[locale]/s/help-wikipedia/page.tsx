import { WikiGapList } from "@/components/WikiGapList";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getGapCandidates } from "@/lib/wikiGaps";
import "@/components/wikihelp.css";

export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("wiki.title"), description: say("wiki.metaDesc"), path: "/help-wikipedia", locale });
}

export default guard(async function HelpWikipediaPage() {
  const { say } = await currentSpeaker();
  const games = await getGapCandidates();
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("wiki.eyebrow")}</span>
        <h1>{say("wiki.title")}</h1>
        <p className="lede">{say("wiki.lede")}</p>
      </section>
      <section className="section">
        <div className="wkbox">
          <h2>{say("wiki.howTitle")}</h2>
          <ol>
            <li>{say("wiki.how1")}</li>
            <li>{say("wiki.how2")}</li>
            <li>{say("wiki.how3")}</li>
            <li>{say("wiki.how4")}</li>
            <li>{say("wiki.how5")}</li>
          </ol>
          <p className="note">{say("wiki.neutral")}</p>
        </div>
      </section>
      <section className="section">
        <h2>{say("wiki.listTitle")}</h2>
        <p className="note">{say("wiki.listNote")}</p>
        <WikiGapList games={games} />
        <noscript><p className="note">{say("wiki.noscript")}</p></noscript>
      </section>
    </>
  );
});
