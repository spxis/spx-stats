"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { cardSvg, cardText, cardWords } from "@/lib/venueCard";
import type { VenueRow, VenueVisited } from "@/lib/venueModel";
import { countVisits, exportVisits, IMPORT_MAX_BYTES, mergeVisits, NOTE_MAX, parseVisits, setDetails, setVisited, type Visit } from "@/lib/venueVisits";
import { useSpeaker } from "./i18n/LocaleProvider";
import { clearVisits, updateVisits, useVisits } from "./visitsStore";
import "./visits.css";

/**
 * "Venues I have been to": a toggle for each venue, an optional day and note, counts, a filter, and export, import and a summary card.
 * The list is the reader's own, kept in this browser (visitsStore.ts) and never sent anywhere; none of it is in the page the server draws.
 */

const today = () => new Date().toLocaleDateString("en-CA");
const mark = (key: string, on: boolean) => updateVisits((v) => setVisited(v, key, on, Date.now()));

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The visited toggle: a pressed button (the state is aria-pressed, not the words), a tick when on. `compact` draws the tick alone, for a table cell. */
export function VisitToggle({ on, name, onToggle, compact }: { on: boolean; name: string; onToggle: () => void; compact?: boolean }) {
  const { say } = useSpeaker();
  return (
    <button type="button" className={`visitbtn${on ? " on" : ""}${compact ? " compact" : ""}`} aria-pressed={on} aria-label={say("visits.toggle", { name })} onClick={onToggle}>
      <span className="visittick" aria-hidden="true">{on ? "✓" : ""}</span>
      {compact ? null : <span aria-hidden="true">{say("visits.visited")}</span>}
    </button>
  );
}

/** The day seen and a short note for one visited venue. The day is saved when it is picked, the note when the field is left or Enter is pressed. */
export function VisitEditor({ vkey, name, visit, onDone }: { vkey: string; name: string; visit: Visit; onDone?: () => void }) {
  const { say } = useSpeaker();
  const id = useId();
  const [d, setD] = useState(visit.d ?? "");
  const [n, setN] = useState(visit.n);
  const save = (day: string, note: string) => updateVisits((v) => setDetails(v, vkey, day || null, note, Date.now()));
  return (
    <div className="visiteditor" role="group" aria-label={say("visits.editFor", { name })}>
      <label htmlFor={`${id}-d`}>{say("visits.date")}</label>
      <input id={`${id}-d`} type="date" value={d} onChange={(e) => { setD(e.target.value); save(e.target.value, n); }} />
      <label htmlFor={`${id}-n`}>{say("visits.note")}</label>
      <input
        id={`${id}-n`} type="text" value={n} maxLength={NOTE_MAX} autoComplete="off" enterKeyHint="done"
        onChange={(e) => setN(e.target.value)} onBlur={() => save(d, n)}
        onKeyDown={(e) => { if (e.key === "Enter") { save(d, n); onDone?.(); } else if (e.key === "Escape") onDone?.(); }}
      />
      {onDone ? <button type="button" onClick={() => { save(d, n); onDone(); }}>{say("visits.done")}</button> : null}
    </div>
  );
}

/** The day and note as one short line, or null. */
export const visitLine = (v: Visit | undefined): string | null => (v ? [v.d, v.n].filter(Boolean).join(" · ") || null : null);

/** The privacy sentence, with a link to the privacy page. */
export function VisitPrivacy() {
  const { say } = useSpeaker();
  return <span>{say("visits.privacy")} <Link href="/privacy" prefetch={false}>{say("nav.privacy")}</Link></span>;
}

/** What to tell the reader when the list cannot be saved or is not ours to change. */
function VisitProblems({ saved, locked }: { saved: boolean; locked: boolean }) {
  const { say } = useSpeaker();
  if (saved && !locked) return null;
  return <p className="note visitwarn" role="status">{locked ? say("visits.locked") : say("visits.unsaved")}</p>;
}

/** The toggle and editor for one venue: on the venue's own page (`always`: the editor is shown whenever it is visited) and in the map's panel. */
export function VisitControl({ vkey, name, always }: { vkey: string; name: string; always?: boolean }) {
  const { say } = useSpeaker();
  const { visits, saved, locked } = useVisits();
  const [open, setOpen] = useState(false);
  const vis = visits[vkey];
  const line = visitLine(vis);
  return (
    <div className="visitctl">
      <div className="visitrow">
        <VisitToggle on={!!vis} name={name} onToggle={() => { mark(vkey, !vis); setOpen(false); }} />
        {vis && !always ? <button type="button" className="visitedit" aria-expanded={open} onClick={() => setOpen(!open)}>{say("visits.edit")}</button> : null}
        {vis && !always && !open && line ? <span className="visitnote">{line}</span> : null}
      </div>
      {vis && (always || open) ? <VisitEditor key={vkey} vkey={vkey} name={name} visit={vis} onDone={always ? undefined : () => setOpen(false)} /> : null}
      <VisitProblems saved={saved} locked={locked} />
      {always ? <p className="note visitpriv"><VisitPrivacy /></p> : null}
    </div>
  );
}

/** The visit toggle for a table row: the list comes from the table, so a row does not listen to the store itself. */
export function VisitCell({ v, vis, editing, onEdit }: { v: VenueRow; vis: Visit | undefined; editing: boolean; onEdit: (open: boolean) => void }) {
  const { say } = useSpeaker();
  const line = visitLine(vis);
  return (
    <div className="visitcell">
      <div className="visitrow">
        <VisitToggle compact on={!!vis} name={v.name} onToggle={() => { mark(v.key, !vis); onEdit(false); }} />
        {vis ? <button type="button" className="visitedit icon" aria-expanded={editing} aria-label={say("visits.editFor", { name: v.name })} onClick={() => onEdit(!editing)}>✎</button> : null}
      </div>
      {vis && !editing && line ? <span className="visitnote">{line}</span> : null}
      {vis && editing ? <VisitEditor vkey={v.key} name={v.name} visit={vis} onDone={() => onEdit(false)} /> : null}
    </div>
  );
}

/** The panel above the filters: the counts, the visited filter, and export, import and the summary card. */
export function VisitBox({ venues, leagues, labelOf, mode, onMode }: { venues: readonly VenueRow[]; leagues: readonly string[]; labelOf: (lg: string) => string; mode: VenueVisited; onMode: (m: VenueVisited) => void }) {
  const { say } = useSpeaker();
  const { visits, saved, locked } = useVisits();
  const counts = useMemo(() => countVisits(venues, visits), [venues, visits]);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const total = Object.keys(visits).length;
  const { all } = counts;

  const words = () => cardWords(counts, leagues, {
    title: say("visits.cardTitle"), site: "spxn.com/venues", name: labelOf,
    of: (seen, of) => say("visits.of", { seen, of }), gone: (n) => say("visits.goneThem", { n }),
  });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > IMPORT_MAX_BYTES) { setMsg(say("visits.importBig")); return; }
    let text = "";
    try { text = await f.text(); } catch { setMsg(say("visits.importBad")); return; }
    const p = parseVisits(text);
    if (p.status === "newer") { setMsg(say("visits.importNewer")); return; }
    if (p.status === "bad") { setMsg(say("visits.importBad")); return; }
    const fresh = Object.keys(p.visits).filter((k) => !visits[k]).length;
    updateVisits((cur) => mergeVisits(cur, p.visits));
    setMsg(`${say("visits.imported", { n: Object.keys(p.visits).length, added: fresh })}${p.skipped ? ` ${say("visits.importSkipped", { n: p.skipped })}` : ""}`);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(cardText(words())); setMsg(say("visits.copied")); } catch { setMsg(say("visits.copyFailed")); }
  };

  const pick = (m: VenueVisited, key: "venuesPage.statusAll" | "visits.only" | "visits.notYet") => (
    <button type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{say(key)}</button>
  );

  return (
    <section className="visitbox" aria-label={say("visits.title")}>
      <p className="visitsum">
        <b>{say("visits.title")}</b>{" "}
        {total || all.seen ? (
          <span>{all.goneSeen ? say("visits.summaryGone", { seen: all.seen, of: all.of, gone: all.goneSeen }) : say("visits.summary", { seen: all.seen, of: all.of })}</span>
        ) : <span>{say("visits.empty")}</span>}
      </p>
      {all.seen ? (
        <ul className="visitleagues" aria-label={say("visits.byLeague")}>
          {leagues.filter((lg) => counts.byLeague[lg]).map((lg) => {
            const t = counts.byLeague[lg];
            return (
              <li key={lg}>
                {t.goneSeen
                  ? say("visits.leagueGone", { league: labelOf(lg), seen: t.seen, of: t.of, gone: t.goneSeen })
                  : say("visits.league", { league: labelOf(lg), seen: t.seen, of: t.of })}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="visitbar">
        <div className="seg" role="group" aria-label={say("visits.filter")}>
          {pick("", "venuesPage.statusAll")}
          {pick("yes", "visits.only")}
          {pick("no", "visits.notYet")}
        </div>
        <details className="visittools">
          <summary>{say("visits.tools")}</summary>
          <div className="visittoolrow">
            <button type="button" disabled={!total} onClick={() => { download(`spxn-venues-visited-${today()}.json`, "application/json", exportVisits(visits, today())); setMsg(say("visits.exported", { n: total })); }}>{say("visits.export")}</button>
            <button type="button" disabled={locked} onClick={() => file.current?.click()}>{say("visits.import")}</button>
            <input ref={file} type="file" accept=".json,application/json" hidden tabIndex={-1} aria-hidden="true" onChange={onFile} />
            <button type="button" disabled={!all.seen} onClick={() => { download("spxn-venues-visited.svg", "image/svg+xml", cardSvg(words())); setMsg(""); }}>{say("visits.card")}</button>
            <button type="button" disabled={!all.seen} onClick={copy}>{say("visits.copy")}</button>
            <button type="button" disabled={!total || locked} onClick={() => { if (window.confirm(say("visits.clearAsk", { n: total }))) { clearVisits(); setMsg(""); } }}>{say("visits.clear")}</button>
          </div>
        </details>
      </div>
      <p className="note" role="status" aria-live="polite">{msg}</p>
      <VisitProblems saved={saved} locked={locked} />
      <p className="note visitpriv"><VisitPrivacy /></p>
    </section>
  );
}
