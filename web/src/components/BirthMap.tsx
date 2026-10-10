"use client";

import { useState } from "react";
import { MapHost } from "@/components/TeamMap";
import { useSpeaker } from "@/components/i18n/LocaleProvider";

/** A small map with one pin where a person was born (Chizu, on Natural Earth). Nothing is drawn if the place cannot be placed. */
export function BirthMap({ lat, lon, name, place }: { lat: number; lon: number; name: string; place: string | null }) {
  const { say } = useSpeaker();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="pmap">
      <MapHost pins={[{ f: 0, name: place || say("player.birthplace"), lat, lon, me: true }]} title={say("player.mapTitle", { name })} onEmpty={() => setHidden(true)} />
      {place ? <span className="note">{place}</span> : null}
    </div>
  );
}
