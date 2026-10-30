"use client";

import dynamic from "next/dynamic";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useSeen } from "./useSeen";
import type { TimelineClub } from "./CityTimeline";

const CityTimeline = dynamic(() => import("./CityTimeline").then((m) => m.CityTimeline), { ssr: false });

/** The timeline's height before it is drawn (the header strip, a row for each club and a little room), so the page below does not jump when it appears. */
const placeholder = (clubs: number) => 20 + 22 * clubs + 4;

/**
 * Which clubs existed when, drawn in the browser when the reader gets near it. It is a drawing a rectangle a season for every club, which for a city with many
 * clubs was over 100 KB of markup, sent again as data; the clubs table above lists the same clubs and years in words, and the legend under it stays in the page.
 */
export function CityTimelineLazy({ clubs }: { clubs: TimelineClub[] }) {
  const { say, fmt } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>();
  if (!clubs.length) return null;
  return (
    <>
      <div ref={ref} style={seen ? undefined : { minHeight: placeholder(clubs.length) }}>{seen ? <CityTimeline clubs={clubs} /> : null}</div>
      <p className="note">{say("timeline.legend", { n: fmt(clubs.length) })}</p>
    </>
  );
}
