import type { Speaker } from "@/lib/i18n/i18n";
import { Rich } from "./i18n/Rich";

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** The credit every World Cup page carries: the Fjelstul database and English Wikipedia (both CC BY-SA 4.0, as their licence asks), openfootball (CC0) and Wikidata. A `<p className="note">`. */
export function SoccerCredit({ say }: { say: Speaker["say"] }) {
  return (
    <p className="note">
      <Rich text={say("wc.credit")} parts={{
        fjelstul: link("https://github.com/jfjelstul/worldcup", "The Fjelstul World Cup Database"),
        licence: link("https://creativecommons.org/licenses/by-sa/4.0/legalcode", "CC BY-SA 4.0"),
        openfootball: link("https://github.com/openfootball/worldcup", "openfootball/worldcup"),
        wikidata: link("https://www.wikidata.org", "Wikidata"),
      }} />
      {" "}
      <Rich text={say("credit.wwc2023")} parts={{
        wikipedia: link("https://en.wikipedia.org/wiki/2023_FIFA_Women%27s_World_Cup", "English Wikipedia"),
        licence: link("https://creativecommons.org/licenses/by-sa/4.0/legalcode", "CC BY-SA 4.0"),
      }} />
    </p>
  );
}
