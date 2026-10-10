"use client";

import { trophySvg } from "@/lib/trophies";
import { useSpeaker } from "./i18n/LocaleProvider";

/** A league's trophy as inline SVG (static markup from lib/trophies.ts, never user input). */
export function Trophy({ league, className }: { league: string; className: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: trophySvg(league) }} />;
}

export function MiniCup({ league }: { league: string }) {
  const { say } = useSpeaker();
  return <span className="minicup" title={say("trophy.champion")} role="img" aria-label={say("trophy.champion")} dangerouslySetInnerHTML={{ __html: trophySvg(league) }} />;
}

/** The small decorative cup in the "Reigning champions" badge. */
export function BadgeCup({ league }: { league: string }) {
  return <span className="rcup" aria-hidden="true" dangerouslySetInnerHTML={{ __html: trophySvg(league) }} />;
}
