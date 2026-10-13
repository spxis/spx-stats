import Link from "next/link";
import { SoccerFlag } from "@/components/SoccerFlag";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { soccerTeamPath } from "@/lib/soccerPath";
import { teamName } from "@/lib/soccerNames";
import "./soccer.css";

/**
 * A national team named in a list or heading: its flag (Hata's drawing from the page's sprite, see SoccerFlag; never an emblem or crest) and its name, as a link to its World Cup page.
 * The name is in the reader's language (lib/soccerNames.ts). `link={false}` for the page's own team.
 */
export async function SoccerTeamName({ slug, name, flag, link = true }: { slug: string; name: string; flag: string | null | undefined; link?: boolean }) {
  const { locale } = await currentSpeaker();
  const label = teamName({ name, slug, flag }, locale);
  return (
    <span className="sct">
      <SoccerFlag code={flag} name={label} />
      {link ? <Link href={soccerTeamPath(slug)} prefetch={false}>{label}</Link> : label}
    </span>
  );
}
