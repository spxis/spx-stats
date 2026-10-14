"use client";

import { trophySvg } from "@/lib/trophies";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The small cup beside a championship season in a table drawn in the browser (the server pages use TrophyMark and TrophyBanner, which ship no script). */
export function MiniCup({ league }: { league: string }) {
  const { say } = useSpeaker();
  return <span className="minicup" title={say("trophy.champion")} role="img" aria-label={say("trophy.champion")} dangerouslySetInnerHTML={{ __html: trophySvg(league) }} />;
}
