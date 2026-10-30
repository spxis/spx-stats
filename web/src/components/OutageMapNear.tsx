"use client";

import { MapViewer } from "./MapViewer";
import type { OutageMapView } from "@/lib/outageMap";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";

/**
 * The map of the clubs of the season before a gap (the section's heading and line are in the page): its pins (about 25 KB) are fetched from the season's `rows/outage-map`
 * when the reader gets near it, so the page itself does not carry them. A season with no club to place leaves the section out once the answer is in.
 */
export function OutageMapNear({ dataHref, season }: { dataHref: string; season: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLElement>();
  const { state, data } = useFetchedJson<OutageMapView>(dataHref, "map", seen);
  if (state === "empty") return null;
  return (
    <section className="section" ref={ref}>
      <h2>{say("outage.mapTitle")}</h2>
      <p>{say("outage.mapLede", { season })}</p>
      {data ? <MapViewer pins={data.pins} title={data.title} note={data.note} /> : state === "failed" ? <p className="note">{say("load.failed")}</p> : <div className="sk-skeleton" role="status">{say("sankey.loading")}</div>}
    </section>
  );
}
