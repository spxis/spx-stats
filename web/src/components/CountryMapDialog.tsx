"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorsOf } from "@/lib/countryRamp";
import { focusColors } from "@/lib/countryFocus";
import { CountryMap } from "./CountryMap";
import { useCountryFocus } from "./CountryScope";
import { useSpeaker } from "./i18n/LocaleProvider";
import { chizu } from "./mapDraw";
import "./country.css";

/**
 * A small world map coloured by player count; pressing it opens the large map (CountryMap) in a dialog, where a country can be pressed to see its count
 * and go to its players. Chizu and its outlines load only here, in the browser. Nothing is drawn if the map cannot be made.
 */
export function CountryMapDialog({ counts, flags, hrefTpl, title, caption, unit, wide }: {
  counts: Record<string, number>; flags: Record<string, true>; hrefTpl?: string; title: string; caption: string; unit: "players" | "playerSeasons";
  /** Fill the width of the column instead of the small thumbnail size. */
  wide?: boolean;
}) {
  const { say, locale } = useSpeaker();
  const thumb = useRef<HTMLDivElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const scope = useCountryFocus();
  const colors = useMemo(() => colorsOf(counts), [counts]);
  const [drawn, setDrawn] = useState(0);
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  useEffect(() => {
    let live = true;
    chizu().then(({ WORLD, drawChizu }) => {
      if (live && thumb.current) { thumb.current.innerHTML = drawChizu(WORLD, { colors, language: locale === "ja" ? "ja" : "en", style: true, label: title }); setDrawn((n) => n + 1); }
    }).catch(() => { if (live) setHidden(true); });
    return () => { live = false; };
  }, [colors, locale, title]);
  // The chosen country and the one under the pointer, painted into the drawing already on the page (no redraw): each country's `--cz-color`.
  useEffect(() => {
    const el = thumb.current;
    if (!el || !drawn) return;
    const next = focusColors(colors, scope.chosen, scope.hover, scope.accent());
    el.querySelectorAll<SVGGElement>("g.cz-region[data-code]").forEach((g) => {
      const c = next[g.getAttribute("data-code") ?? ""];
      if (c) g.style.setProperty("--cz-color", c); else g.style.removeProperty("--cz-color");
    });
  }, [drawn, colors, scope]);
  if (hidden) return null;
  return (
    <div className={wide ? "cmapthumb wide" : "cmapthumb"}>
      <button type="button" aria-label={say("country.mapOpen", { title })} onClick={() => setOpen(true)}>
        <div className="thumbbox" ref={thumb} />
      </button>
      <span className="cap">{caption}</span>
      {open ? (
        <dialog ref={dlg} className="mapdlg cmapdlg" aria-label={title} onClose={() => setOpen(false)}
          onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
          <div className="dlghead">
            <h2>{title}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
          </div>
          <CountryMap counts={counts} flags={flags} hrefTpl={hrefTpl} label={title} unit={unit} />
        </dialog>
      ) : null}
    </div>
  );
}
