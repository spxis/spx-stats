import { LinkList } from "@/components/LinkList";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { MLS_PATH } from "@/lib/mlsPath";
import { SOCCER_PATH, WORLDCUP_PATH } from "@/lib/soccerPath";

/** The footer's links to soccer (kept out of SiteChrome so the footer's own phrase list stays as it was). */
export async function SoccerFooterLinks() {
  const { say } = await currentSpeaker();
  return <LinkList links={[[SOCCER_PATH, say("nav.soccer")], [WORLDCUP_PATH, say("wc.title")], [MLS_PATH, say("mls.title")]]} />;
}
