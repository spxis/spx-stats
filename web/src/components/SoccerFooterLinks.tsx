import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { MLS_PATH } from "@/lib/mlsPath";
import { SOCCER_PATH, WORLDCUP_PATH } from "@/lib/soccerPath";

/** The footer's links to soccer (kept out of SiteChrome so the footer's own phrase list stays as it was). */
export async function SoccerFooterLinks() {
  const { say } = await currentSpeaker();
  return (
    <>
      <Link href={SOCCER_PATH}>{say("nav.soccer")}</Link>
      <Link href={WORLDCUP_PATH}>{say("wc.title")}</Link>
      <Link href={MLS_PATH}>{say("mls.title")}</Link>
    </>
  );
}
