import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { CC_BY_SA_URL, WIKIPEDIA_REUSE_URL } from "./Credits";
import { Rich } from "./i18n/Rich";

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** The credit every college football page carries: English Wikipedia (CC BY-SA 4.0, as its licence asks). A `<p className="note">`. */
export async function NcaafCredit() {
  const { say } = await currentSpeaker();
  return (
    <p className="note ncaaf-credit">
      <Rich text={say("ncaaf.credit")} parts={{ wikipedia: link(WIKIPEDIA_REUSE_URL, say("credit.wikipediaLink")), licence: link(CC_BY_SA_URL, "CC BY-SA 4.0") }} />
    </p>
  );
}
