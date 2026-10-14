"use client";

import { medalSvg, trophySvg } from "@/lib/trophies";
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

/** A gold, silver or bronze medal for a first, second or third place, beside the text that names the place (so it is hidden from screen readers). */
export function PlaceMedal({ place }: { place: number }) {
  return <span className="placemedal" aria-hidden="true" dangerouslySetInnerHTML={{ __html: medalSvg(place) }} />;
}
