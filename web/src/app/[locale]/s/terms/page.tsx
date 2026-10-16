import Link from "@/components/Link";
import { Credits } from "@/components/Credits";
import { Rich } from "@/components/i18n/Rich";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { pageMeta } from "@/lib/meta";

export const revalidate = 86400;

const UPDATED = new Date("2026-10-11");

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("terms.title"), description: say("terms.metaDesc"), path: "/terms", locale });
}

export default async function TermsPage() {
  const { say, dt } = await currentSpeaker();
  const issues = <a href="https://github.com/spxis/spx-stats/issues">{say("about.contactLink")}</a>;
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{say("terms.eyebrow")}</span>
        <h1>{say("terms.title")}</h1>
        <p className="lede">{say("terms.lede")}</p>
      </section>
      <section className="section prose">
        <h2>{say("terms.useTitle")}</h2>
        <p>{say("terms.use")}</p>
        <p>{say("terms.outside")}</p>
        <p>{say("terms.bots")}</p>
        <h2>{say("terms.asisTitle")}</h2>
        <p><Rich text={say("terms.asis")} parts={{ quality: <Link href="/quality">{say("nav.quality")}</Link> }} /></p>
        <p><Rich text={say("terms.errors")} parts={{ link: issues }} /></p>
        <h2>{say("terms.creditsTitle")}</h2>
        <p>{say("footer.archive")}</p>
        <p className="retro">
          <Rich text={say("footer.retro")} parts={{ link: <a href="https://www.retrosheet.org">www.retrosheet.org</a> }} />
        </p>
        <p>
          <Rich text={say("footer.sources")} parts={{
            nflverse: <a href="https://github.com/nflverse">nflverse</a>,
            wikidata: <a href="https://www.wikidata.org">Wikidata</a>,
          }} />
        </p>
        <p><Rich text={say("terms.lahman")} parts={{ sources: <Link href="/sources">{say("nav.sources")}</Link> }} /></p>
        <p>{say("terms.wikipedia")}</p>
        <p><Credits say={say} use={["maps"]} /></p>
        <p><Credits say={say} use={["flags"]} /></p>
        <p><Credits say={say} use={["addresses"]} /></p>
        <p><Credits say={say} use={["surfaces"]} /></p>
        <p><Credits say={say} use={["emblems"]} /></p>
        <p><Credits say={say} use={["brackets"]} /></p>
        <p><Rich text={say("terms.fullList")} parts={{ sources: <Link href="/sources">{say("nav.sources")}</Link> }} /></p>
        <h2>{say("terms.logosTitle")}</h2>
        <p>
          <Rich text={say("footer.logos")} parts={{ link: <Link href="/logos">{say("footer.aboutLogos")}</Link> }} />
        </p>
        <p><Rich text={say("terms.logosRemoval")} parts={{ link: issues }} /></p>
        <h2>{say("terms.ownerTitle")}</h2>
        <p>{say("terms.owner")}</p>
        <p>{say("terms.notLegal")}</p>
        <p className="note">{say("legal.updated", { date: dt.ymd(UPDATED) })}</p>
      </section>
    </>
  );
}
