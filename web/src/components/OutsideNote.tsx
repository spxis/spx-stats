import { getMembers } from "@/lib/leagueMembers";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

/**
 * On the page of a team that is no member of its league (an FCS opponent of a college football team): a plain note that it appears only as an opponent,
 * so a link from a game or a table never lands on a page that looks like a league team's. Draws nothing for a member, or for a league without outsiders.
 */
export async function OutsideNote({ lg, f, name }: { lg: string; f: number; name: string }) {
  const members = await getMembers(lg);
  if (!members || members.has(f)) return null;
  const { say } = await currentSpeaker();
  return <p className="note outside-note">{say("ncaaf.outside", { team: name })}</p>;
}
