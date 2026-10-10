"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import { formatSort, parseSort, sortRows, type SortColumn, type SortKey, type SortRow } from "@/lib/sort";
import { hrefWith, replaceQuery } from "@/lib/urlQuery";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

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
}

/**
 * The one sortable table of the site. A column header is a button: pressing it sorts by that column, pressing it again
 * reverses. The sort lives in the address (?sort=column.dir) so a reload or a shared link keeps it. Numbers sort as numbers
 * and blanks come last whichever way the sort runs. The rows arrive already drawn (the page makes the links), so the
 * table is server-rendered and crawlable.
 */
export function SortTable({ columns, rows, param = "sort", def = null, initial, remote = false, label, groups }: Props) {
  const router = useRouter();
  const { say } = useSpeaker();
  const known = useMemo(() => columns.map((c) => c.key), [columns]);
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

  const shown = useMemo(() => sortRows(rows, spec, (r, k) => r.sort[k]), [rows, spec]);
  const first = spec[0];

  function press(c: SortColumn) {
    const dir = first && first.key === c.key ? (first.dir === "desc" ? "asc" : "desc") : c.num ? "desc" : "asc";
    const next: SortKey[] = [{ key: c.key, dir }];
    setPicked(next);
    if (remote && c.rest) startTransition(() => router.replace(hrefWith({ [param]: formatSort(next) }), { scroll: false }));
    else replaceQuery({ [param]: formatSort(next) });
  }

  const row = (r: SortRow) => (
    <tr key={r.id} className={r.className}>
      {columns.map((c) => (
        <td key={c.key} className={`${c.num ? "num " : ""}${c.cls ?? ""}`.trim() || undefined}>{r.cells[c.key]}</td>
      ))}
    </tr>
  );

  return (
    <table aria-busy={pending || undefined} aria-label={label}>
      <thead>
        <tr>
          {columns.map((c) => {
            const on = first?.key === c.key;
            const state = on ? (first.dir === "desc" ? "descending" : "ascending") : "none";
            const next = on ? (first.dir === "desc" ? "ascending" : "descending") : c.num ? "descending" : "ascending";
            return (
              <th key={c.key} className={`${c.num ? "num " : ""}${c.cls ?? ""}`.trim() || undefined} aria-sort={state} scope="col">
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
}
