import type { Speaker } from "@/lib/i18n/i18n";
import { Rich } from "./i18n/Rich";

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** The credit every MLS page carries: English Wikipedia (CC BY-SA 4.0, as its licence asks), openfootball (CC0) and Wikidata. A `<p className="note">`. */
export function MlsCredit({ say }: { say: Speaker["say"] }) {
  return (
    <p className="note">
      <Rich text={say("mls.credit")} parts={{
        wikipedia: link("https://en.wikipedia.org/wiki/Major_League_Soccer", "Wikipedia"),
        licence: link("https://creativecommons.org/licenses/by-sa/4.0/legalcode", "CC BY-SA 4.0"),
        openfootball: link("https://github.com/openfootball/world", "openfootball/world"),
        wikidata: link("https://www.wikidata.org", "Wikidata"),
      }} />
    </p>
  );
}
