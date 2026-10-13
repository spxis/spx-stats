import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { TitleNotAwardedRow } from "@/lib/api/types";

/**
 * The champion card of a season whose title was not awarded: the same banner a won title gets, reading e.g. "Stanley Cup: Not
 * awarded" with the reason beneath. The title's name and the reason are data (api.title_not_awarded), in the reader's language
 * where there is one and in English otherwise.
 */
export async function NotAwarded({ row }: { row: TitleNotAwardedRow }) {
  const { say, locale } = await currentSpeaker();
  const translated = locale === "fr" ? row.reason_fr : locale === "ja" ? row.reason_ja : null;
  return (
    <section className="banner">
      <span className="cup">{row.award}</span>
      <span className="who">{say("season.notAwarded")}</span>
      <span className="how">
        <span lang={translated || locale === "en" ? undefined : "en"}>{translated ?? row.reason_en}</span>
        <span className="note">
          {" "}{say("outage.credit")}
          {row.source_url ? <>{" "}<a href={row.source_url} rel="noopener noreferrer">{say("sched.source")}</a></> : null}
        </span>
      </span>
    </section>
  );
}
