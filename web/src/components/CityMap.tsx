"use client";

import { useEffect, useRef, useState } from "react";
import { MapViewer } from "./MapViewer";
import { MapHost } from "./TeamMap";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { Pin } from "./mapDraw";
import "./city.css";

/**
 * A small map in the corner of a city page, framed on the venues in the city itself. Pressing it opens the large map (MapViewer) in a dialog: the
 * venues of the city's clubs and of its metro area, with the venue list and the map credits under it. Nothing is drawn if no venue can be placed.
 */
export function CityMapCorner({ pins, name }: { pins: Pin[]; name: string }) {
  const { say, fmt } = useSpeaker();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  if (hidden || !pins.length) return null;
  const title = say("city.mapTitle", { name });
  return (
    <div className="citymap">
      <button type="button" className="mapbtn" aria-label={say("city.mapOpen", { name })} onClick={() => setOpen(true)}>
        <MapHost pins={pins} title={title} onEmpty={() => setHidden(true)} />
      </button>
      <span className="note">{say("city.mapCaption", { n: fmt(pins.length) })}</span>
      {open ? (
        <dialog ref={dlg} className="mapdlg" aria-label={title} onClose={() => setOpen(false)}
          onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
          <div className="dlghead">
            <h2>{title}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
          </div>
          <MapViewer tight pins={pins} title={title} total={pins.length} note={say("city.mapNote", { n: fmt(pins.length) })} />
        </dialog>
      ) : null}
    </div>
  );
}
