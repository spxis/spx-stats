"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { chizu, frame, NS, pinText, type Pin } from "./mapDraw";
import { useSpeaker } from "./i18n/LocaleProvider";
import { MapViewerLazy } from "./MapViewerLazy";
import { useFetchedJson } from "./useFetchedJson";
import type { FranchiseMapView } from "@/lib/mapView";

/* Team maps, drawn with Chizu (MIT, https://github.com/johnmorrisdotca/chizu) from Natural Earth
   outlines (public domain). A small map on a team page marks its home; pressing it opens a large
   map (MapViewer) of every team in the league that season. Chizu and its 170 kB of outlines load only here. */

export type { Pin };

/** Draws a small map of the pins into `host`; returns false when nothing could be placed. */
async function drawTeamMap(host: HTMLElement, teams: Pin[], opts: { title: string; locale: Locale }): Promise<boolean> {
  const { WORLD, drawChizu, projectPoint } = await chizu();
  const placed = teams
    .map((t) => ({ ...t, p: projectPoint(WORLD, Number(t.lon), Number(t.lat)) }))
    .filter((t): t is Pin & { p: [number, number] } => !!t.p);
  if (!placed.length) return false;
  const focus = placed.filter((t) => t.me);
  const box = frame((focus.length ? focus : placed).map((t) => t.p), 1.4, 90);
  host.className = "teammap";
  host.innerHTML = drawChizu(WORLD, { box, tones: { US: "faint", CA: "faint", MX: "faint" }, language: opts.locale === "ja" ? "ja" : "en", style: true });
  const svg = host.querySelector("svg");
  if (!svg) return false;
  svg.setAttribute("aria-label", opts.title);
  const r = box.width / 40;
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "pins");
  for (const t of placed.sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0))) {
    const a = document.createElementNS(NS, "a");
    a.setAttribute("aria-label", pinText(t));
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", String(t.p[0])); c.setAttribute("cy", String(t.p[1])); c.setAttribute("r", String(t.me ? r * 1.6 : r));
    c.setAttribute("class", t.me ? "pin me" : "pin");
    const ti = document.createElementNS(NS, "title"); ti.textContent = pinText(t); c.append(ti);
    a.append(c); g.append(a);
  }
  svg.append(g);
  return true;
}

export function MapHost({ pins, title, onEmpty }: { pins: Pin[]; title: string; onEmpty?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { locale } = useSpeaker();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    drawTeamMap(el, pins, { title, locale }).then((ok) => { if (live && !ok) onEmpty?.(); }).catch(() => { if (live) onEmpty?.(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once per mount
  }, []);
  return <div ref={ref} className="teammap" style={{ aspectRatio: "1.4" }} />;
}

/**
 * A small map of the team's home in the corner of its page. Pressing it opens a dialog with a large map
 * of every team in the league that season; a dot opens that team. The other clubs' pins are fetched from `dataHref` (the franchise's `rows/map`)
 * when the dialog is first opened, so the page carries only this club's pin.
 */
export function TeamMapCorner({ me, dataHref, seasonLabel, leagueShort, name }: {
  me: Pin; dataHref: string; seasonLabel: string; leagueShort: string; name: string;
}) {
  const { say } = useSpeaker();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(me.f);
  const dlg = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const label = say("map.label", { league: leagueShort, season: seasonLabel });
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  const [asked, setAsked] = useState(false);
  const { data } = useFetchedJson<FranchiseMapView>(dataHref, "view", asked);
  if (hidden) return null;
  const others = data?.league ?? [];
  const all = others.some((p) => p.f === me.f) ? others : [...others, me];
  // Closing applies the map's choice: the page moves to the chosen club.
  const closed = () => {
    setOpen(false);
    const href = picked !== me.f ? all.find((p) => p.f === picked)?.href : undefined;
    if (href) router.push(href);
  };
  return (
    <>
      <button type="button" className="mapbtn" aria-label={say("map.open", { league: leagueShort, season: seasonLabel })} onClick={() => { setAsked(true); setOpen(true); }}>
        <MapHost pins={[me]} title={say("map.where", { name })} onEmpty={() => setHidden(true)} />
      </button>
      {open ? (
        <dialog ref={dlg} className="mapdlg" aria-label={label} onClose={closed}
          onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
          <div className="dlghead">
            <h2>{label}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
          </div>
          {data ? <MapViewerLazy pins={all} title={label} total={data.clubCount} selected={picked} onPick={setPicked} /> : <p className="note" role="status">{say("load.loading")}</p>}
        </dialog>
      ) : null}
    </>
  );
}
