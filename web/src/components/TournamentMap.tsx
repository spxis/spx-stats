"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChizuMount } from "@johnmorrisdotca/chizu/mount";
import { joinList } from "@/lib/people-format";
import { jumpToSquad } from "@/lib/squadJump";
import { soccerTeamPath } from "@/lib/soccerPath";
import { TIER_COLORS, TIER_PHRASES, type StripTeam } from "@/lib/soccerStrip";
import { useSpeaker } from "./i18n/LocaleProvider";
import { chizu } from "./mapDraw";
import "./country.css";
import "./tournamentmap.css";

/**
 * A small world map in the corner of a tournament page, each team's country coloured by how far the team went (the colours of the strip under the heading,
 * lib/soccerStrip.ts). Pressing it opens the large map in a dialog: hovering a country shows its teams with the stage reached, matches played, wins, draws and
 * losses and goals, and pressing it goes to the team's squad lower on the page (the closed list opens), as the strip does. On a touch screen a press shows that
 * panel first, with a link to the squad. Chizu (on Natural Earth) and its outlines load only here, in the browser; a team whose country the map has no outline
 * for (a team that is gone, or a small island) is named under the map. Nothing is drawn if the map cannot be made.
 */
export function TournamentMap({ teams, title }: { teams: readonly StripTeam[]; title: string }) {
  const { say, plural, locale } = useSpeaker();
  const router = useRouter();
  const thumb = useRef<HTMLDivElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<ChizuMount | null>(null);
  const touch = useRef(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [off, setOff] = useState<string[]>([]);
  const [tip, setTip] = useState<{ code: string; x: number; y: number } | null>(null);
  const [picked, setPickedState] = useState<string | null>(null);
  const pickedNow = useRef<string | null>(null);
  const setPicked = (code: string | null) => { pickedNow.current = code; setPickedState(code); };

  // The teams of each country of the map, the furthest-going first (the home nations of the United Kingdom share one).
  const byRegion = useMemo(() => {
    const m = new Map<string, StripTeam[]>();
    for (const t of teams) if (t.region) m.set(t.region, [...(m.get(t.region) ?? []), t].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)));
    return m;
  }, [teams]);
  const colors = useMemo(() => Object.fromEntries([...byRegion].map(([r, list]) => [r, TIER_COLORS[list[0].tier]])), [byRegion]);
  const tiers = useMemo(() => [...new Set(teams.map((t) => t.tier))].sort((a, b) => a - b), [teams]);
  const language = locale === "ja" ? "ja" : "en";

  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);

  // The small map.
  useEffect(() => {
    let live = true;
    chizu().then(({ WORLD, drawChizu }) => {
      if (live && thumb.current) thumb.current.innerHTML = drawChizu(WORLD, { colors, language, style: true, label: title });
    }).catch(() => { if (live) setHidden(true); });
    return () => { live = false; };
  }, [colors, language, title]);

  const go = (t: StripTeam) => {
    dlg.current?.close();
    if (t.squad) jumpToSquad(t.anchor);
    else router.push(soccerTeamPath(t.slug));
  };

  // The large map, mounted while the dialog is open.
  useEffect(() => {
    const el = host.current;
    if (!open || !el) return;
    let live = true;
    (async () => {
      const [{ default: WORLD }, { mountChizu }] = await Promise.all([import("@johnmorrisdotca/chizu/world"), import("@johnmorrisdotca/chizu/mount")]);
      if (!live) return;
      const have = new Set(WORLD.regions.map((r) => r.code));
      setOff(teams.filter((t) => !t.region || !have.has(t.region)).map((t) => t.name));
      mount.current = mountChizu(el, {
        map: WORLD, language, colors, fit: false,
        onSelect: (code) => {
          const list = code ? byRegion.get(code) : undefined;
          if (!code || !list) { setPicked(null); return; }
          if (touch.current && pickedNow.current !== code) setPicked(code);
          else go(list[0]);
        },
      });
    })();
    return () => { live = false; mount.current?.destroy(); mount.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once per opening; the chosen country is read from a ref and `go` only uses refs and the router when a country is pressed
  }, [open, language, colors, byRegion, teams]);

  if (hidden) return null;

  const moved = (e: React.PointerEvent) => {
    touch.current = e.pointerType === "touch";
    if (touch.current) return;
    const g = (e.target as Element).closest?.("g.cz-region[data-code]");
    const code = g?.getAttribute("data-code") ?? "";
    const box = host.current?.getBoundingClientRect();
    setTip(code && byRegion.has(code) && box ? { code, x: e.clientX - box.left, y: e.clientY - box.top } : null);
  };
  const tipTeams = tip ? byRegion.get(tip.code) ?? [] : [];
  const pickedTeams = picked ? byRegion.get(picked) ?? [] : [];
  const record = (t: StripTeam) => say("wc.map.record", { matches: plural("count.matches", t.p), w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga });

  return (
    <div className="wcmap">
      <button type="button" className="wcmapbtn" aria-label={say("wc.map.open", { title })} onClick={() => setOpen(true)}>
        <div className="thumbbox" ref={thumb} />
      </button>
      <span className="note">{say("wc.map.caption")}</span>
      {open ? (
        <dialog ref={dlg} className="mapdlg cmapdlg" aria-label={say("wc.map.title", { title })} onClose={() => { setOpen(false); setTip(null); setPicked(null); }}
          onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
          <div className="dlghead">
            <h2>{say("wc.map.title", { title })}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>{say("map.close")}</button>
          </div>
          <div className="cmap">
            <div className="wcmaphost" onPointerMove={moved} onPointerDown={(e) => { touch.current = e.pointerType === "touch"; }} onPointerLeave={() => setTip(null)}>
              <div className="cmap-host" ref={host} role="group" aria-label={say("wc.map.title", { title })} />
              {tip && tipTeams.length ? (
                <div className="wctip" role="status" style={{ left: `min(${Math.round(tip.x) + 14}px, calc(100% - 230px))`, top: tip.y + 14 }}>
                  {tipTeams.map((t) => (
                    <div key={t.id}>
                      <b>{t.name}</b>
                      <span className={`wcdot t${t.tier}`} aria-hidden="true" />{t.stage}
                      <small>{record(t)}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <ul className="wclegend" aria-label={say("wc.map.legend")}>
              {tiers.map((tr) => <li key={tr}><span className={`wcdot t${tr}`} aria-hidden="true" />{say(TIER_PHRASES[tr])}</li>)}
            </ul>
            <div className="cmap-pick" aria-live="polite">
              {pickedTeams.length ? pickedTeams.map((t) => (
                <div key={t.id} className="wcpick">
                  <b>{t.name}</b> <span>{t.stage}</span> <small>{record(t)}</small>
                  <button type="button" className="linkish" onClick={() => go(t)}>{say("wc.map.go", { team: t.name })}</button>
                </div>
              )) : <span className="note">{say("wc.map.press")}</span>}
            </div>
            {off.length ? <p className="note cmap-off">{say("wc.map.off", { list: joinList(off, locale) })}</p> : null}
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
