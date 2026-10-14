import Link from "next/link";
import { SoccerFlag } from "@/components/SoccerFlag";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { soccerTeamPath } from "@/lib/soccerPath";
import { teamName } from "@/lib/soccerNames";
import "./soccer.css";

/**
 * A national team named in a list or heading: its round flag (Hata's drawing from the page's sprite, see SoccerFlag; never an emblem or crest) and its
 * name, as a link to its World Cup page. The name is in the reader's language (lib/soccerNames.ts). `link={false}` for the page's own team.
 * `large` stacks a large round flag over the name, for the heading of a match, a pairing or a team.
 */
export async function SoccerTeamName({ slug, name, flag, link = true, large = false }: { slug: string; name: string; flag: string | null | undefined; link?: boolean; large?: boolean }) {
  const { locale } = await currentSpeaker();
  const label = teamName({ name, slug, flag }, locale);
  return (
    <span className={large ? "sct sct-lg" : "sct"}>
      <SoccerFlag code={flag} name={label} large={large} />
      {link ? <Link href={soccerTeamPath(slug)} prefetch={false}>{label}</Link> : label}
    </span>
  );
}
