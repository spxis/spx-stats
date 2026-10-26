import Link from "@/components/Link";
import type { Speaker } from "@/lib/i18n/i18n";
import { Rich } from "./i18n/Rich";
import { europeClubPath } from "@/lib/europePath";
import "./soccer.css";

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** A European club named in a list or heading: its name as a link to the club's page. No crest: a club's logo is not ours to draw. */
export function EuropeClubName({ slug, name, link: linked = true }: { slug: string; name: string; link?: boolean }) {
  return <span className="sct">{linked ? <Link href={europeClubPath(slug)} prefetch={false}>{name}</Link> : name}</span>;
}

/** The credit every European league page carries: openfootball (CC0), English Wikipedia (CC BY-SA 4.0, as its licence asks) and Wikidata. A `<p className="note">`. */
export function EuropeCredit({ say }: { say: Speaker["say"] }) {
  return (
    <p className="note">
      <Rich text={say("europe.credit")} parts={{
        openfootball: link("https://github.com/openfootball", "openfootball"),
        wikipedia: link("https://en.wikipedia.org/wiki/Association_football_in_Europe", "Wikipedia"),
        licence: link("https://creativecommons.org/licenses/by-sa/4.0/legalcode", "CC BY-SA 4.0"),
        wikidata: link("https://www.wikidata.org", "Wikidata"),
      }} />
    </p>
  );
}
