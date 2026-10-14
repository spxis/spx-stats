"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useSpeaker } from "./i18n/LocaleProvider";
import { clampPage, JUMP_SELECT_MAX } from "@/lib/pager";

/**
 * "Go to page" beside the pager. An ordinary GET form: its action is the list's path and `hidden` holds every other query key, so it works without script
 * (a select, then a button inside <noscript>; or a number box with its Go button) and the new address keeps the filters and the sort. With script a choice goes
 * at once: page 1 drops `page` from the address, and in a list the browser pages `onJump` is called instead of loading the address.
 * Up to JUMP_SELECT_MAX pages it is a select of every page; past that a number box, because a select of a thousand lines is clumsy to scroll.
 */
export function PagerJump({ page, pages, action, hidden, param = "page", onJump }: {
  page: number;
  pages: number;
  action: string;
  hidden: [string, string][];
  param?: string;
  onJump?: (page: number) => void;
}) {
  const { say, fmt } = useSpeaker();
  const id = useId();
  const router = useRouter();
  const go = (raw: unknown) => {
    const n = clampPage(raw, pages);
    if (n == null) return;
    if (onJump) { onJump(n); return; }
    const q = new URLSearchParams(hidden);
    if (n > 1) q.set(param, String(n));
    const s = q.toString();
    router.push(s ? `${action}?${s}` : action);
  };
  const asSelect = pages <= JUMP_SELECT_MAX;
  return (
    <form className="pagejump" action={action} method="get" noValidate onSubmit={(e) => { e.preventDefault(); go(new FormData(e.currentTarget).get(param)); }}>
      <label htmlFor={id}>{say("pager.goto")}</label>
      {asSelect ? (
        <select key={page} id={id} name={param} defaultValue={String(page)} onChange={(e) => go(e.currentTarget.value)}>
          {Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{fmt(i + 1)}</option>)}
        </select>
      ) : (
        <input key={page} id={id} name={param} type="number" inputMode="numeric" min={1} max={pages} step={1} defaultValue={page} autoComplete="off" />
      )}
      <span className="of">{say("pager.of", { pages: fmt(pages) })}</span>
      {hidden.map(([k, v], i) => <input key={`${k}${i}`} type="hidden" name={k} value={v} />)}
      {asSelect ? <noscript><button type="submit">{say("pager.go")}</button></noscript> : <button type="submit">{say("pager.go")}</button>}
    </form>
  );
}
