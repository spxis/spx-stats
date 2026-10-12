"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TeamLogo } from "./TeamLogo";
import "./h2h.css";

export type CompareGroup = "division" | "conference" | "other" | "league" | "none";

export interface CompareClub { f: number; name: string; alt: string[]; first: number; last: number; active: boolean; logo: string | null; group: CompareGroup; href: string }

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ORDER: CompareGroup[] = ["division", "conference", "other", "league", "none"];

/**
 * The Compare button of a team page: a panel with quick choices (the clubs of the same division, the same conference
 * in other divisions, the other conference) and a search box over every club of the league. Each club is a plain link
 * to the comparison page, so the choice is an address that can be shared.
 */
export function CompareMenu({ name, season, clubs, labels }: {
  name: string;
  /** The season the groups are those of (the season viewed, or the latest of the club). */
  season: string;
  clubs: CompareClub[];
  /** The names of the club's own division and conference. */
  labels: { division: string | null; conference: string | null };
}) {
  const { say, fmt } = useSpeaker();
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<CompareGroup | "all">("all");

  const present = useMemo(() => new Set(clubs.map((c) => c.group)), [clubs]);
  const choices = (["division", "conference", "other"] as const).filter((g) => present.has(g));
  const items = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return clubs
      .filter((c) => (only === "all" || c.group === only) && words.every((w) => plain([c.name, ...c.alt].join(" ")).includes(w)))
      .sort((x, y) => ORDER.indexOf(x.group) - ORDER.indexOf(y.group) || Number(y.active) - Number(x.active) || x.name.localeCompare(y.name));
  }, [clubs, only, query]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const show = () => {
    if (open) { setOpen(false); return; }
    setQuery("");
    setOpen(true);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const links = () => [...(list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = links();
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    const next = e.key === "ArrowDown" ? at + 1 : at - 1;
    if (e.key === "ArrowUp" && at <= 0) { e.preventDefault(); input.current?.focus(); return; }
    if (all[next]) { e.preventDefault(); all[next].focus(); }
  };

  const heading = (g: CompareGroup) => {
    if (g === "division") return say("compare.group.division", { name: labels.division ?? "" });
    if (g === "conference") return say("compare.group.conference", { name: labels.conference ?? "" });
    if (g === "other") return say("compare.group.other");
    return say(g === "league" ? "compare.group.league" : "compare.group.notThen", { season });
  };
  const chipLabel = (g: CompareGroup | "all") => (g === "all" ? say("compare.chip.all") : say(`compare.chip.${g as "division" | "conference" | "other"}`));
  const headings = only === "all" && !query.trim();
  const listId = `${uid}-list`;

  return (
    <div className="cmpctl" ref={root} onKeyDown={onKey}>
      <div className="pickwrap">
        <button
          ref={trigger}
          type="button"
          className="pickbtn cmpbtn"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={show}
        >
          <span className="pn">{say("compare.button")}</span>
          <span className="caret" aria-hidden="true" />
        </button>
        {open ? (
          <div className="pickpop cmppop">
            <p className="cmpwith">{say("compare.with", { team: name })}</p>
            {choices.length ? (
              <div className="seg" role="group" aria-label={say("compare.chip.aria")}>
                {(["all", ...choices] as const).map((g) => (
                  <button key={g} type="button" aria-pressed={only === g} onClick={() => setOnly(g)}>{chipLabel(g)}</button>
                ))}
              </div>
            ) : null}
            <input
              ref={input}
              type="text"
              aria-label={say("h2h.pick.search")}
              placeholder={say("h2h.pick.search")}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && items[0]) { e.preventDefault(); links()[0]?.click(); } }}
            />
            <ul id={listId} ref={list}>
              {items.map((c, i) => {
                const head = headings && items[i - 1]?.group !== c.group;
                const years = c.active ? say("h2h.pick.since", { year: c.first }) : `${c.first}–${c.last}`;
                return (
                  <Fragment key={c.f}>
                    {head ? <li role="presentation" className="grp">{heading(c.group)}</li> : null}
                    <li>
                      <Link href={c.href} prefetch={false} onClick={() => setOpen(false)}>
                        <span className="ol"><TeamLogo url={c.logo} size={24} shape="square" /></span>
                        <span className="ot"><span className="on1">{c.name}</span><span className="on2">{years}</span></span>
                      </Link>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
            <div className="sr-only" role="status">{items.length ? say("h2h.pick.results", { n: fmt(items.length) }) : say("h2h.pick.none")}</div>
            {items.length ? null : <p className="pnone">{say("h2h.pick.none")}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
