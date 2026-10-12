"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { fold } from "@/lib/fold";
import { capFirst } from "@/lib/people-format";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TeamLogo } from "./TeamLogo";
import "./search.css";

interface Suggestion {
  id: number;
  name: string;
  league: string;
  first_season: number | null;
  last_season: number | null;
  url: string;
  position?: string | null;
  active?: boolean;
  matched?: string | null;
  logo?: string | null;
}

const MIN = 2;
const WAIT = 150;

/**
 * The search box of the players and teams lists: an ordinary search form (it submits to the list without script) whose text box suggests while
 * you type, from /api/<kind>/suggest, a combobox over a listbox like the head-to-head picker. Choosing a suggestion opens that player or team;
 * Enter with none chosen runs the full search. Each keystroke waits 150 ms, and a request that is no longer wanted is cancelled; the list stays
 * put while the next one loads, so it does not flicker.
 */
export function SearchBox({ kind, action, name = "q", defaultValue = "", league = "", hidden = {}, placeholder, buttonLabel }: {
  kind: "players" | "teams";
  action: string;
  name?: string;
  defaultValue?: string;
  league?: string;
  hidden?: Record<string, string>;
  placeholder: string;
  buttonLabel: string;
}) {
  const { say, fmt } = useSpeaker();
  const router = useRouter();
  const uid = useId();
  const root = useRef<HTMLFormElement>(null);
  const kept = useRef(new Map<string, Suggestion[]>());
  const [text, setText] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [shown, setShown] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const [busy, setBusy] = useState(false);

  const key = fold(text);
  const wanted = key.length >= MIN;

  useEffect(() => {
    if (!wanted) return;
    const had = kept.current.get(`${league}|${key}`);
    if (had) {
      const t = setTimeout(() => { setItems(had); setShown(key); setBusy(false); }, 0);
      return () => clearTimeout(t);
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/${kind}/suggest?q=${encodeURIComponent(text.trim())}${league ? `&league=${league}` : ""}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { data: Suggestion[] };
        kept.current.set(`${league}|${key}`, body.data);
        setItems(body.data);
        setShown(key);
        setAt(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") { setItems([]); setShown(key); }
      } finally {
        if (!ctl.signal.aborted) setBusy(false);
      }
    }, WAIT);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [kind, league, text, key, wanted]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (at >= 0) document.getElementById(`${uid}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [at, uid]);

  const list = wanted ? items : [];
  const visible = open && list.length > 0;
  const listId = `${uid}-list`;

  const go = (s: Suggestion) => {
    setOpen(false);
    router.push(s.url);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!visible) { if (list.length) setOpen(true); return; }
      setAt((i) => (i + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visible) setAt((i) => (i <= 0 ? list.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (visible && list[at]) { e.preventDefault(); go(list[at]); }
    } else if (e.key === "Escape") {
      if (visible) { e.preventDefault(); setOpen(false); setAt(-1); }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const years = (s: Suggestion) =>
    s.first_season == null ? "" : s.active ? `${s.first_season}–${say("search.present")}` : s.last_season != null && s.last_season !== s.first_season ? `${s.first_season}–${s.last_season}` : String(s.first_season);
  const detail = (s: Suggestion) =>
    [s.league, kind === "players" && s.position ? capFirst(s.position) : "", years(s), s.matched ? say("h2h.pick.formerly", { name: s.matched }) : ""].filter(Boolean).join(" · ");

  return (
    <form action={action} method="get" role="search" className="controls sbox" ref={root}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="sinput">
        <input
          type="search"
          name={name}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && at >= 0 ? `${uid}-${at}` : undefined}
          aria-busy={busy || undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); setAt(-1); }}
          onFocus={() => { if (list.length) setOpen(true); }}
          onKeyDown={onKey}
        />
        <ul id={listId} role="listbox" aria-label={placeholder} hidden={!visible} onMouseDown={(e) => e.preventDefault()}>
          {list.map((s, i) => (
            <li
              key={`${s.league}-${s.id}`}
              id={`${uid}-${i}`}
              role="option"
              aria-selected={i === at}
              className={i === at ? "on" : undefined}
              onClick={() => go(s)}
              onMouseMove={() => { if (i !== at) setAt(i); }}
            >
              {kind === "teams" ? <span className="ol"><TeamLogo url={s.logo} size={24} shape="square" /></span> : null}
              <span className="ot">
                <span className="on1">{s.name}</span>
                <span className="on2">{detail(s)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="sr-only" role="status">{visible && shown === key ? say("search.results", { n: fmt(list.length) }) : ""}</div>
      </div>
      <button type="submit">{buttonLabel}</button>
    </form>
  );
}
