"use client";

import { useEffect, useRef, useState } from "react";
import { MapViewer } from "./MapViewer";
import { MapHost } from "./TeamMap";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { Pin } from "./mapDraw";
import "./city.css";

/** A short text that changes whenever the dots do, so the small map is drawn again for a new set of teams (it draws once per mount). */
function signature(pins: Pin[]): string {
  let h = 0;
  for (const p of pins) h = (Math.imul(h, 31) + p.f * 7 + Math.round(Number(p.lat) * 100) + Math.round(Number(p.lon) * 100)) | 0;
  return `${pins.length}:${h}`;
}

/**
 * A small map in the top-right corner of the teams page, framed on the teams the list shows now. Pressing it opens the large map (MapViewer) in a
 * dialog with the same teams: a dot opens its team. It follows the page's filters (the page gives it the dots of every team that passes them, not only
 * the page of the table on screen). Nothing is drawn if no team can be placed. A season page gives its own `text` (its season's wording) and its dots.
 */
export function TeamsMapCorner({ pins, text }: { pins: Pin[]; text?: { title: string; open: string; caption: string; note: string } }) {
  const { say, fmt } = useSpeaker();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const sig = signature(pins);
  if (!pins.length || failed === sig) return null;
  const title = text?.title ?? say("teams.mapTitle");
  return (
    <div className={"citymap teamsmap" + (text ? " seasonmap" : "")}>
      <button type="button" className="mapbtn" aria-label={text?.open ?? say("teams.mapOpen")} onClick={() => setOpen(true)}>
        <MapHost key={sig} pins={pins} title={title} onEmpty={() => setFailed(sig)} />
      </button>
      <span className="note">{text?.caption ?? say("teams.mapCaption", { n: fmt(pins.length) })}</span>
      {open ? (
        <dialog ref={dlg} className="mapdlg" aria-label={title} onClose={() => setOpen(false)}
          onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
          <div className="dlghead">
            <h2>{title}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
          </div>
          <MapViewer pins={pins} title={title} total={pins.length} note={text?.note ?? say("teams.mapNote", { n: fmt(pins.length) })} onNavigate={() => dlg.current?.close()} />
        </dialog>
      ) : null}
    </div>
  );
}
