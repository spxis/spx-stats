"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Pin } from "./mapDraw";
import { useSpeaker } from "./i18n/LocaleProvider";
import { MapViewer } from "./MapViewer";
import { MapHost } from "./TeamMap";
import "./mapviewer.css";

/* The map on a team's season page. A small map in the corner and the "Home venue" line open a dialog with a large map of every
   club of the league that season; the dialog's state is in the address (?map=open or ?map=venue, and ?mapteam=<slug> for another
   club), so a view can be shared and the back button closes it. "venue" zooms in on the club's venue, "open" shows the league. */

type Mode = "open" | "venue";

/** The control that opened the dialog, so focus can go back to it when the dialog closes. */
let opener: HTMLElement | null = null;

const query = (change: (q: URLSearchParams) => void) => {
  const q = new URLSearchParams(location.search);
  change(q);
  const s = q.toString();
  return location.pathname + (s ? `?${s}` : "");
};

/** Fresh state for replaceState (Next ignores a call that passes its own state back), carrying only our flag. */
const keep = () => (history.state?.spxMap ? { spxMap: 1 } : null);

/** Opens the dialog as a new history entry, so the back button closes it. */
function openMap(mode: Mode, from: HTMLElement) {
  opener = from;
  history.pushState({ spxMap: 1 }, "", query((q) => { q.set("map", mode); q.delete("mapteam"); }));
}

/** Another club in the dialog replaces the entry, so back still closes the dialog in one step. */
function chooseTeam(slug: string | null) {
  history.replaceState(keep(), "", query((q) => { if (slug) q.set("mapteam", slug); else q.delete("mapteam"); }));
}

/** Back to the page when the dialog was opened from it; the address cleaned in place when it came in with the link. */
function closeMap() {
  if (history.state?.spxMap) history.back();
  else history.replaceState(keep(), "", query((q) => { q.delete("map"); q.delete("mapteam"); }));
}

/** The small map of the club's home in the corner of the page; pressing it opens the league map. */
export function SeasonMapThumb({ me, leagueShort, seasonLabel, name }: { me: Pin; leagueShort: string; seasonLabel: string; name: string }) {
  const { say } = useSpeaker();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <button type="button" className="mapbtn atfoot" aria-label={say("map.open", { league: leagueShort, season: seasonLabel })} onClick={(e) => openMap("open", e.currentTarget)}>
      <MapHost pins={[me]} title={say("map.where", { name })} onEmpty={() => setHidden(true)} />
    </button>
  );
}

const MARK = "\u0001";

/** The "Home venue: …" line, with the venue a button that opens the map centred on it. */
export function SeasonVenueLine({ venue }: { venue: string }) {
  const { say } = useSpeaker();
  const [before, after] = say("tseason.venue", { venue: MARK }).split(MARK);
  return (
    <p className="lede">
      {before}
      <button type="button" className="linkbtn" aria-label={say("tmap.venueOpen", { venue })} onClick={(e) => openMap("venue", e.currentTarget)}>{venue}</button>
      {after}
    </p>
  );
}

/** The dialog, mounted only while the address asks for it. `pins` carry no `me`: the chosen club comes from the address. */
export function SeasonMapDialog(props: DialogProps) {
  // Reading the address' query makes a kept page draw this part in the browser; the boundary keeps that to the dialog alone.
  return <Suspense fallback={null}><DialogGate {...props} /></Suspense>;
}

function DialogGate(props: DialogProps) {
  const mode = useSearchParams().get("map");
  return mode === "open" || mode === "venue" ? <Dialog {...props} mode={mode} /> : null;
}

interface DialogProps { pins: Pin[]; me: number; clubCount: number; leagueShort: string; seasonLabel: string }

function Dialog({ pins, me, clubCount, leagueShort, seasonLabel, mode }: DialogProps & { mode: Mode }) {
  const { say } = useSpeaker();
  const team = useSearchParams().get("mapteam");
  const dlg = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const heading = useId();
  const sorted = useMemo(() => [...pins].sort((a, b) => a.name.localeCompare(b.name, "en")), [pins]);
  const chosen = pins.find((p) => p.slug === team) ?? pins.find((p) => p.f === me) ?? pins[0];
  const router = useRouter();
  const latest = useRef(chosen);
  useEffect(() => { latest.current = chosen; });

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    // Closing applies the map's choice: the page moves to the chosen club's season.
    const onClose = () => {
      const c = latest.current;
      if (c.f !== me && c.href) router.replace(c.href); else closeMap();
    };
    d.addEventListener("close", onClose);
    if (!d.open) d.showModal();
    return () => {
      d.removeEventListener("close", onClose);
      requestAnimationFrame(() => { if (opener?.isConnected && !document.querySelector("dialog[open]")) opener.focus(); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; the handler reads refs
  }, []);

  const label = say("map.label", { league: leagueShort, season: seasonLabel });
  const bar = (
    <select aria-label={say("venues.team")} value={chosen.slug ?? ""} onChange={(e) => chooseTeam(pins.find((p) => p.slug === e.target.value)?.f === me ? null : e.target.value)}>
      {sorted.map((p) => <option key={p.f} value={p.slug}>{p.name}</option>)}
    </select>
  );

  return (
    <dialog ref={dlg} className="mapdlg" aria-labelledby={heading}
      onPointerDown={(e) => { downOnBackdrop.current = e.target === dlg.current; }}
      onClick={(e) => { if (e.target === dlg.current && downOnBackdrop.current) dlg.current?.close(); }}>
      <div className="dlghead">
        <h2 id={heading}>{label}</h2>
        <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
      </div>
      <MapViewer pins={pins} title={label} bar={bar} selected={chosen.f} zoomToSelected={mode === "venue"}
        onPick={(f) => { const p = pins.find((x) => x.f === f); if (p) chooseTeam(f === me ? null : p.slug ?? null); }}
        note={say("tmap.note", { n: pins.length, total: clubCount, season: seasonLabel })} />
    </dialog>
  );
}
