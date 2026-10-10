"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* Team maps, drawn with Chizu (MIT, https://github.com/johnmorrisdotca/chizu) from Natural Earth
   outlines (public domain). A small map on a team page marks its home; pressing it opens a large
   map of every team in the league that season. Chizu and its 170 kB of outlines load only here. */

export interface Pin {
  f: number;
  name: string;
  lat: number;
  lon: number;
  venue?: string | null;
  href?: string;
  me?: boolean;
}

type Chizu = {
  WORLD: typeof import("@johnmorrisdotca/chizu/world").default;
  drawChizu: typeof import("@johnmorrisdotca/chizu/draw").drawChizu;
  projectPoint: typeof import("@johnmorrisdotca/chizu").projectPoint;
};
let lib: Promise<Chizu> | null = null;
function chizu(): Promise<Chizu> {
  lib ??= Promise.all([import("@johnmorrisdotca/chizu/world"), import("@johnmorrisdotca/chizu/draw"), import("@johnmorrisdotca/chizu")]).then(
    ([world, draw, eng]) => ({ WORLD: world.default, drawChizu: draw.drawChizu, projectPoint: eng.projectPoint }),
  );
  return lib;
}

// A window round the points, wider than tall, with room to spare; never smaller than a region.
function frame(pts: [number, number][], aspect: number, minW: number) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let w = Math.max(x1 - x0, minW) * 1.25, h = Math.max(y1 - y0, minW / aspect) * 1.25;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

const NS = "http://www.w3.org/2000/svg";

/** Draws a map of the pins into `host`; returns false when nothing could be placed. */
async function drawTeamMap(host: HTMLElement, teams: Pin[], opts: { big?: boolean; title?: string }): Promise<boolean> {
  const big = !!opts.big;
  const { WORLD, drawChizu, projectPoint } = await chizu();
  const placed = teams
    .map((t) => ({ ...t, p: projectPoint(WORLD, Number(t.lon), Number(t.lat)) }))
    .filter((t): t is Pin & { p: [number, number] } => !!t.p);
  if (!placed.length) return false;
  const focus = big ? placed : placed.filter((t) => t.me);
  const box = frame((focus.length ? focus : placed).map((t) => t.p), big ? 1.7 : 1.4, big ? 60 : 90);
  host.className = "teammap" + (big ? " big" : "");
  host.innerHTML = drawChizu(WORLD, { box, tones: { US: "faint", CA: "faint", MX: "faint" }, language: "en", style: true });
  const svg = host.querySelector("svg");
  if (!svg) return false;
  svg.setAttribute("aria-label", opts.title || "Map of team locations");
  const r = box.width / (big ? 140 : 40);
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "pins");
  for (const t of placed.sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0))) {
    const a = document.createElementNS(NS, "a");
    if (big && t.href) a.setAttribute("href", t.href);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", String(t.p[0])); c.setAttribute("cy", String(t.p[1])); c.setAttribute("r", String(t.me ? r * 1.6 : r));
    c.setAttribute("class", t.me ? "pin me" : "pin");
    const ti = document.createElementNS(NS, "title");
    ti.textContent = t.name + (t.venue ? ` · ${t.venue}` : "");
    c.append(ti); a.append(c); g.append(a);
  }
  svg.append(g);
  return true;
}

function MapHost({ pins, big, title, onEmpty }: { pins: Pin[]; big?: boolean; title: string; onEmpty?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    drawTeamMap(el, pins, { big, title }).then((ok) => { if (live && !ok) onEmpty?.(); }).catch(() => { if (live) onEmpty?.(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once per mount
  }, []);
  return <div ref={ref} className={"teammap" + (big ? " big" : "")} style={big ? { minHeight: 200 } : { aspectRatio: "1.4" }} />;
}

/**
 * A small map of the team's home in the corner of its page. Pressing it opens a dialog with a large map
 * of every team in the league that season; a dot opens that team.
 */
export function TeamMapCorner({ me, others, clubCount, seasonLabel, leagueShort, name }: {
  me: Pin; others: Pin[]; clubCount: number; seasonLabel: string; leagueShort: string; name: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const label = `${leagueShort} teams, ${seasonLabel}`;
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  if (hidden) return null;
  const all = others.length ? others : [me];
  return (
    <>
      <button type="button" className="mapbtn" aria-label={`Map of every ${leagueShort} team in ${seasonLabel}`} onClick={() => setOpen(true)}>
        <MapHost pins={[me]} title={`Where the ${name} play`} onEmpty={() => setHidden(true)} />
      </button>
      {open ? (
        <dialog ref={dlg} className="mapdlg" aria-label={label} onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === dlg.current) { dlg.current?.close(); return; }
            const a = (e.target as Element).closest("a[href^='/']");
            if (a && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); dlg.current?.close(); router.push(a.getAttribute("href")!); }
          }}>
          <div className="dlghead">
            <h2>{label}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>Close</button>
          </div>
          <MapHost pins={all} big title={label} />
          <p className="note">{others.length} of {clubCount} teams placed. Press a dot to open that team. Map: Chizu, from Natural Earth.</p>
        </dialog>
      ) : null}
    </>
  );
}
