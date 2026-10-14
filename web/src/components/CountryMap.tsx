"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChizuMount } from "@johnmorrisdotca/chizu/mount";
import { colorsOf, fillHref, RAMP } from "@/lib/countryRamp";
import { countryName, joinList } from "@/lib/people-format";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./country.css";

/**
 * The world with each country coloured by its player count (Chizu, on Natural Earth): drag, zoom with the buttons, Ctrl or ⌘ and the wheel, or a pinch.
 * Pressing a country names it, gives its count and links to its players (`hrefFor`). Under the map the same figures are a list of links, so nothing
 * depends on the map being seen. A country Chizu has no outline for is named under the map instead.
 */
export function CountryMap({ counts, flags, hrefTpl, label, unit, empty }: {
  counts: Record<string, number>; flags: Record<string, true>; hrefTpl?: string; label: string;
  /** What the counts are: players, or player-seasons. */
  unit: "players" | "playerSeasons"; empty?: string;
}) {
  const { say, plural, fmt, locale } = useSpeaker();
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<ChizuMount | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [off, setOff] = useState<string[]>([]);
  const colors = useMemo(() => colorsOf(counts), [counts]);
  const latest = useRef(colors);
  useEffect(() => { latest.current = colors; mount.current?.set({ colors }); }, [colors]);
  const entries = useMemo(() => Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [counts]);
  const max = entries[0]?.[1] ?? 0;
  const entriesRef = useRef(entries);
  useEffect(() => { entriesRef.current = entries; });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    (async () => {
      const [{ default: WORLD }, { mountChizu }] = await Promise.all([import("@johnmorrisdotca/chizu/world"), import("@johnmorrisdotca/chizu/mount")]);
      if (!live) return;
      const have = new Set(WORLD.regions.map((r) => r.code));
      setOff(entriesRef.current.map(([c]) => c).filter((c) => !have.has(c)));
      mount.current = mountChizu(el, { map: WORLD, language: locale === "ja" ? "ja" : "en", colors: latest.current, fit: false, onSelect: setPicked });
    })();
    return () => { live = false; mount.current?.destroy(); mount.current = null; };
  }, [locale]);

  const count = (c: string) => counts[c] ?? 0;
  const noun = (n: number) => (unit === "players" ? plural("count.players", n) : plural("count.playerSeasons", n));
  const name = (c: string) => countryName(c, locale);
  const flag = (c: string) => (flags[c] ? <FlagIcon code={c} /> : null);
  const offKnown = off.filter((c) => count(c) > 0);

  return (
    <div className="cmap">
      <div className="cmap-host" ref={host} role="group" aria-label={label} />
      <div className="cmap-scale" aria-hidden="true">
        <span>1</span>
        <i style={{ "--ramp0": RAMP[0], "--ramp1": RAMP[1] } as React.CSSProperties} />
        <span>{fmt(max)}</span>
      </div>
      <div className="cmap-pick" aria-live="polite">
        {picked && count(picked) > 0 ? (
          <>
            {flag(picked)}<b>{name(picked)}</b>
            <span>{noun(count(picked))}</span>
            {hrefTpl ? <Link href={fillHref(hrefTpl, picked)} prefetch={false}>{say("country.mapShow", { name: name(picked) })}</Link> : null}
          </>
        ) : picked ? (
          <><b>{name(picked)}</b><span>{say("country.mapNoPlayers")}</span></>
        ) : (
          <span className="note">{entries.length ? say("country.mapPress") : empty ?? say("country.mapEmpty")}</span>
        )}
      </div>
      {offKnown.length ? <p className="note cmap-off">{say("country.mapOff", { list: joinList(offKnown.map((c) => `${name(c)} (${fmt(count(c))})`), locale) })}</p> : null}
      {entries.length ? (
        <ul className="cmap-list" aria-label={say("country.mapList")}>
          {entries.map(([c, n]) => (
            <li key={c}>
              {flag(c)}
              {hrefTpl ? <Link href={fillHref(hrefTpl, c)} prefetch={false}>{name(c)}</Link> : name(c)}
              <span className="n">{fmt(n)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
