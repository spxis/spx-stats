"use client";

import { useEffect, useRef, useState } from "react";
import { MapHost } from "@/components/TeamMap";
import { MapViewerLazy } from "@/components/MapViewerLazy";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import type { Pin } from "@/components/mapDraw";

/**
 * A small map with one pin where a person was born (Chizu, on Natural Earth). Pressing it opens the large map with the
 * hometown and the home venue of each team the person played for. Nothing is drawn if the place cannot be placed.
 */
export function BirthMap({ home, pins, name }: { home: Pin; pins: Pin[]; name: string }) {
  const { say } = useSpeaker();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(home.f);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  if (hidden) return null;
  const title = say("player.mapTitle", { name });
  return (
    <div className="pmap">
      <button type="button" className="mapbtn" aria-label={say("player.mapOpen", { name })} onClick={() => setOpen(true)}>
        <MapHost pins={[{ ...home, me: true }]} title={title} onEmpty={() => setHidden(true)} />
      </button>
      {home.name ? <span className="note">{home.name}</span> : null}
      {open ? (
        <dialog ref={dlg} className="mapdlg" aria-label={title} onClose={() => setOpen(false)}
          onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
          <div className="dlghead">
            <h2>{title}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
          </div>
          <MapViewerLazy pins={pins} title={title} selected={picked} onPick={setPicked} note={say("player.mapNote")} />
        </dialog>
      ) : null}
    </div>
  );
}
