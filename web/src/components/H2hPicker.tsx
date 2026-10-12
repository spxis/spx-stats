"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { comparePath } from "@/lib/compare";
import { pairPath } from "@/lib/h2h";
import { parseLoc } from "@/lib/loc";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import { TeamLogo } from "./TeamLogo";
import "./h2h.css";

export interface PickClub { f: number; name: string; alt: string[]; first: number; last: number; active: boolean; logo: string | null }

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The two teams of a head-to-head page, each a button that opens a searchable list of the league's other clubs
 * (a combobox over a listbox). Choosing one keeps the other team and goes to the new pair's page: the pair is
 * addressed alphabetically, so the clubs may change sides, and ?loc= (the first club's home or road) is flipped to follow.
 */
export function H2hPicker({ lg, clubs, a, b, names, logos, kind = "h2h" }: {
  lg: string;
  clubs: PickClub[];
  a: number;
  b: number;
  names: readonly [string, string];
  logos: readonly [string | null, string | null];
  /** The page the choice goes to: the pair's head-to-head (the default) or their comparison. */
  kind?: "h2h" | "compare";
}) {
  const { say, fmt } = useSpeaker();
  const router = useRouter();
  const paths = usePaths();
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<(HTMLButtonElement | null)[]>([null, null]);
  const [open, setOpen] = useState<0 | 1 | null>(null);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);

  const ids: [number, number] = [a, b];
  const fixed = open == null ? null : ids[open === 0 ? 1 : 0];
  const fixedClub = clubs.find((c) => c.f === fixed);

  const items = useMemo(() => {
    if (open == null) return [];
    const words = plain(query).split(/\s+/).filter(Boolean);
    const byName = (c: PickClub) => (words.every((w) => plain(c.name).includes(w)) ? 0 : 1);
    return clubs
      .filter((c) => c.f !== fixed)
      .filter((c) => {
        const hay = plain([c.name, ...c.alt].join(" "));
        return words.every((w) => hay.includes(w));
      })
      .sort((x, y) => byName(x) - byName(y));
  }, [clubs, open, fixed, query]);

  useEffect(() => {
    if (open == null) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open != null) document.getElementById(`${uid}-${items[at]?.f}`)?.scrollIntoView({ block: "nearest" });
  }, [open, at, items, uid]);

  const show = (side: 0 | 1) => {
    if (open === side) { setOpen(null); return; }
    const current = ids[side];
    const list = clubs.filter((c) => c.f !== ids[side === 0 ? 1 : 0]);
    setQuery("");
    setAt(Math.max(0, list.findIndex((c) => c.f === current)));
    setOpen(side);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  };

  const close = (back: boolean) => {
    const side = open;
    setOpen(null);
    if (back && side != null) trigger.current[side]?.focus();
  };

  const choose = (c: PickClub) => {
    if (open == null || fixed == null) return;
    if (c.f === ids[open]) { close(true); return; }
    const to = (kind === "compare" ? comparePath : pairPath)(paths, lg, fixed, c.f);
    const was = new URLSearchParams(location.search);
    const q = new URLSearchParams();
    const phase = was.get("phase");
    if (phase && kind === "h2h") q.set("phase", phase);
    const label = was.get("season");
    const year = label ? Number(label.slice(0, 4)) : NaN;
    if (label === "all" && kind === "compare") q.set("season", label);
    else if (label && fixedClub && year >= Math.max(c.first, fixedClub.first) && year <= Math.min(c.last, fixedClub.last)) q.set("season", label);
    const loc = parseLoc(was.get("loc"));
    if (loc !== "all" && kind === "h2h") {
      // ?loc= is the first club's home or road: when the kept club changes sides, so does the meaning.
      const flips = (to.a === fixed) !== (a === fixed);
      q.set("loc", flips ? (loc === "home" ? "road" : "home") : loc);
    }
    const s = q.toString();
    setOpen(null);
    router.push(`${to.path}${s ? `?${s}` : ""}`);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "PageDown") { e.preventDefault(); setAt((i) => Math.min(items.length - 1, i + 8)); }
    else if (e.key === "PageUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 8)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[at]) choose(items[at]); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  const never = (c: PickClub) => !!fixedClub && (c.last < fixedClub.first || c.first > fixedClub.last);
  const bothKinds = !query.trim() && items.some((c) => c.active) && items.some((c) => !c.active);
  const listId = `${uid}-list`;

  const chip = (side: 0 | 1) => (
    <button
      key={side}
      type="button"
      ref={(el) => { trigger.current[side] = el; }}
      className="pickbtn"
      aria-haspopup="listbox"
      aria-expanded={open === side}
      aria-controls={open === side ? listId : undefined}
      aria-label={say("h2h.pick.button", { team: names[side] })}
      onClick={() => show(side)}
      onKeyDown={(e) => { if (e.key === "ArrowDown" && open !== side) { e.preventDefault(); show(side); } }}
    >
      <TeamLogo url={logos[side]} size={26} shape="square" />
      <span className="pn">{names[side]}</span>
      <span className="caret" aria-hidden="true" />
    </button>
  );

  return (
    <div className="h2hpick" ref={root}>
      <span className="pk">{say("h2h.pick.label")}</span>
      <div className="pickwrap">
        {chip(0)}
        {open === 0 ? popup() : null}
      </div>
      <span className="pvs" aria-hidden="true">vs</span>
      <div className="pickwrap end">
        {chip(1)}
        {open === 1 ? popup() : null}
      </div>
    </div>
  );

  function popup() {
    let seen: boolean | null = null;
    return (
      <div className="pickpop">
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items[at] ? `${uid}-${items[at].f}` : undefined}
          aria-label={say("h2h.pick.search")}
          placeholder={say("h2h.pick.search")}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setAt(0); }}
          onKeyDown={onKey}
        />
        <ul id={listId} role="listbox" aria-label={say("h2h.pick.label")} onMouseDown={(e) => e.preventDefault()}>
          {items.map((c, i) => {
            const heading = bothKinds && seen !== c.active;
            seen = c.active;
            const viaAlt = query && !plain(c.name).includes(plain(query).trim()) ? c.alt.find((n) => plain(n).includes(plain(query).trim())) : null;
            const years = c.active ? say("h2h.pick.since", { year: c.first }) : `${c.first}–${c.last}`;
            return (
              <Fragment key={c.f}>
                {heading ? <li role="presentation" className="grp">{say(c.active ? "h2h.pick.active" : "h2h.pick.former")}</li> : null}
                <li
                  id={`${uid}-${c.f}`}
                  role="option"
                  aria-selected={c.f === ids[open!]}
                  className={`${i === at ? "on" : ""}${c.f === ids[open!] ? " cur" : ""}`}
                  onClick={() => choose(c)}
                  onMouseMove={() => { if (i !== at) setAt(i); }}
                >
                  <span className="ol"><TeamLogo url={c.logo} size={24} shape="square" /></span>
                  <span className="ot">
                    <span className="on1">{c.name}</span>
                    <span className="on2">{viaAlt ? `${say("h2h.pick.formerly", { name: viaAlt })} · ` : ""}{years}</span>
                  </span>
                  {never(c) ? <span className="nv" title={say("h2h.pick.neverTitle")}>{say("h2h.pick.never")}</span> : c.f === ids[open!] ? <span className="nv cu">{say("h2h.pick.current")}</span> : null}
                </li>
              </Fragment>
            );
          })}
        </ul>
        <div className="sr-only" role="status">{items.length ? say("h2h.pick.results", { n: fmt(items.length) }) : say("h2h.pick.none")}</div>
        {items.length ? null : <p className="pnone">{say("h2h.pick.none")}</p>}
      </div>
    );
  }
}
