"use client";

import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import { formatSort, parseSort, sortRows, type SortColumn, type SortKey, type SortRow } from "@/lib/sort";
import { hrefWith, replaceQuery } from "@/lib/urlQuery";
import { idleLink, type RowLink } from "./rowLink";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

/** One row. It listens only to whether its own id is marked on the linked chart, so a chart hover redraws one or two rows, not the table. */
const Row = memo(function Row({ r, columns, link }: { r: SortRow; columns: SortColumn[]; link?: RowLink }) {
  const l = link ?? idleLink;
  const mark = useSyncExternalStore(l.subscribe, () => { const s = l.get(); return s.pin === r.id ? "pin" : s.chart === r.id ? "chart" : ""; }, () => "");
  const stamp = useSyncExternalStore(l.subscribe, () => { const s = l.get(); return s.pin === r.id ? s.stamp : 0; }, () => 0);
  const ref = useRef<HTMLTableRowElement>(null);
  const seen = useRef(stamp);
  useEffect(() => {
    if (stamp && stamp !== seen.current) ref.current?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    seen.current = stamp;
  }, [stamp]);
  const className = [r.className, link && "rowlink", mark && "linked", mark === "pin" && "pinned"].filter(Boolean).join(" ") || undefined;
  const events = link ? {
    onPointerEnter: (ev: React.PointerEvent) => { if (ev.pointerType !== "touch") link.set({ table: r.id }); },
    onPointerLeave: (ev: React.PointerEvent) => { if (ev.pointerType !== "touch") link.set({ table: null }); },
    onFocus: () => link.set({ table: r.id }),
    onBlur: (ev: React.FocusEvent<HTMLTableRowElement>) => { if (!ev.currentTarget.contains(ev.relatedTarget)) link.set({ table: null }); },
  } : undefined;
  return (
    <tr ref={ref} className={className} aria-current={mark === "pin" ? "true" : undefined} {...events}>
      {columns.map((c) => (
        <td key={c.key} className={`${c.num ? "num " : ""}${c.cls ?? ""}`.trim() || undefined}>{r.cells[c.key]}</td>
      ))}
    </tr>
  );
});

interface Props {
  columns: SortColumn[];
  rows: SortRow[];
  /** The query key that holds this table's sort: `sort`, or `sort_<name>` for a second table on a page. */
  param?: string;
  /** The sort when the address names none, as `column.asc|desc`. */
  def?: string | null;
  /** The sort the server read from the address, for a page it renders per request. Leave it out on a static page: the table reads the address once it is on screen. */
  initial?: SortKey[];
  /** Sorting by a column with a `rest` field asks the server to reload the rows in that order (it passes order= to the API) instead of sorting what the page holds. */
  remote?: boolean;
  label?: string;
  /** Draws the rows in sections, each under a heading row, in this order; a row falls in the section its `group` names. One sort serves them all. */
  groups?: { id: string; title: string; sub?: string }[];
  /** Ties each row to a mark on a chart by row id: the row under the pointer or focus is announced to the chart, and the point the chart marks lights its row. */
  link?: RowLink;
  /** The page keeps the sort itself (it sorts and pages the whole list before giving this table a page of it): a press calls this with the new sort, and nothing is written to the address here. Pair it with `initial`, the sort the page holds. */
  onSort?: (sort: SortKey[]) => void;
  /** Draws only the first `limit` rows of the sort in force, under a "Show all" button that draws the rest (already on the page: no request). The sort still covers every row. */
  limit?: number;
  /**
   * The rows given are only the first of the table: the page left the rest out (they come from `load` when asked for). A "Show all" link under the table
   * calls `load`, and is a plain link to `href` (the whole list as a page of its own) where script is off or the rest could not be fetched. A sort other than the
   * default asks for the rest at once, because it must cover every row. `loaded` says the rows given are now all of them.
   */
  partial?: { total: number; loaded: boolean; state: "idle" | "loading" | "failed" | "done"; load: () => void; href: string };
}

/**
 * The one sortable table of the site. A column header is a button: pressing it sorts by that column, pressing it again
 * reverses. The sort lives in the address (?sort=column.dir) so a reload or a shared link keeps it. Numbers sort as numbers
 * and blanks come last whichever way the sort runs. The rows arrive already drawn (the page makes the links), so the
 * table is server-rendered and crawlable.
 */
export function SortTable({ columns, rows, param = "sort", def = null, initial, remote = false, label, groups, link, onSort, limit, partial }: Props) {
  const router = useRouter();
  const { say } = useSpeaker();
  const known = useMemo(() => columns.filter((c) => !c.nosort).map((c) => c.key), [columns]);
  const [pending, startTransition] = useTransition();
  const defSpec = useMemo(() => parseSort(def, known), [def, known]);

  // A static page cannot know the address, so the table reads it once it is on screen (the server render uses the default).
  const urlValue = useSyncExternalStore(subscribe, () => new URLSearchParams(location.search).get(param) ?? "", () => "");
  const fromUrl = useMemo(() => parseSort(urlValue, known), [urlValue, known]);

  // What the reader pressed since the page was drawn. A page the server renders per request hands over the sort it read
  // (`initial`), and when that changes (the rows came back from the API in the new order) the press has been answered.
  const [picked, setPicked] = useState<SortKey[] | null>(null);
  const served = initial ? formatSort(initial) : null;
  const [seen, setSeen] = useState(served);
  if (served !== seen) { setSeen(served); setPicked(null); }
  const spec = picked ?? initial ?? (fromUrl.length ? fromUrl : defSpec);

  // A sort that is not the default must cover every row, so it brings in the rest of a partial table (the rows it holds now are just the newest).
  const wantsAll = picked != null || fromUrl.length > 0;
  const needRest = partial != null && !partial.loaded && wantsAll;
  const loadRest = partial?.load;
  useEffect(() => { if (needRest) loadRest?.(); }, [needRest, loadRest]);

  const sorted = useMemo(() => sortRows(rows, spec, (r, k) => r.sort[k]), [rows, spec]);
  const [all, setAll] = useState(false);
  const capped = limit != null && !all && sorted.length > limit;
  const shown = capped ? sorted.slice(0, limit) : sorted;
  const first = spec[0];

  function press(c: SortColumn) {
    const dir = first && first.key === c.key ? (first.dir === "desc" ? "asc" : "desc") : c.num ? "desc" : "asc";
    const next: SortKey[] = [{ key: c.key, dir }];
    setPicked(next);
    if (onSort) onSort(next);
    else if (remote && c.rest) startTransition(() => router.replace(hrefWith({ [param]: formatSort(next), page: null }), { scroll: false }));
    else replaceQuery({ [param]: formatSort(next) });
  }

  const row = (r: SortRow) => <Row key={r.id} r={r} columns={columns} link={link} />;

  const table = (
    <table aria-busy={pending || undefined} aria-label={label}>
      <thead>
        <tr>
          {columns.map((c) => {
            const cls = `${c.num ? "num " : ""}${c.cls ?? ""}`.trim() || undefined;
            if (c.nosort) {
              return (
                <th key={c.key} className={cls} scope="col" title={c.title}>{c.hideLabel ? <span className="sr-only">{c.label}</span> : c.label}</th>
              );
            }
            const on = first?.key === c.key;
            const state = on ? (first.dir === "desc" ? "descending" : "ascending") : "none";
            const next = on ? (first.dir === "desc" ? "ascending" : "descending") : c.num ? "descending" : "ascending";
            return (
              <th key={c.key} className={cls} aria-sort={state} scope="col">
                <button type="button" className="sortbtn" title={c.title} aria-label={say(next === "ascending" ? "table.sortAsc" : "table.sortDesc", { label: c.label })} onClick={() => press(c)}>
                  <span className={c.hideLabel ? "sr-only" : undefined}>{c.label}</span>
                  <span className="arrow" aria-hidden="true">{on ? (first.dir === "desc" ? "▼" : "▲") : "↕"}</span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      {groups ? groups.map((g) => {
        const inGroup = shown.filter((r) => r.group === g.id);
        return inGroup.length ? (
          <tbody key={g.id}>
            {g.title ? (
              <tr className="grouphead">
                <th scope="colgroup" colSpan={columns.length}>{g.title}{g.sub ? <span className="sub">{g.sub}</span> : null}</th>
              </tr>
            ) : null}
            {inGroup.map(row)}
          </tbody>
        ) : null;
      }) : <tbody>{shown.map(row)}</tbody>}
    </table>
  );
  if (partial && !partial.loaded) {
    const busy = partial.state === "loading";
    return (
      <>
        {table}
        <p className="showall">
          <a href={partial.href} aria-busy={busy || undefined} onClick={(e) => { if (partial.state !== "failed") { e.preventDefault(); if (!busy) partial.load(); } }}>
            {busy ? say("load.loading") : say("table.showAll", { count: String(partial.total) })}
          </a>
        </p>
      </>
    );
  }
  if (!capped) return table;
  return (
    <>
      {table}
      <p className="showall"><button type="button" onClick={() => setAll(true)}>{say("table.showAll", { count: String(sorted.length) })}</button></p>
    </>
  );
}
