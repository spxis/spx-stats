import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import type { Speaker } from "@/lib/i18n/i18n";
import { pageWindow } from "@/lib/pager";
import { PagerJump } from "./PagerJump";
import "./pager.css";

/**
 * The one pager of every paged list: « ‹ 1 … 47 48 [49] 50 51 … 999 › », with a "Go to page" control beside it. A phone gets the current page and one on each
 * side (the first and last page stay, « » go: the numbers already reach both ends). The current page is `aria-current="page"`; the ends are greyed, not links.
 * `href(n)` makes the address of page n (every other filter and sort kept, page 1 without `page`); the jump form is worked out from `href(1)`: its path is the
 * form's action and its other query keys are hidden fields, so the jump works without script and, with script, goes at once.
 *
 * On a page the server draws, leave `onPage` out: the links are ordinary links. In a list the browser pages (the teams board), pass `onPage`: a plain press
 * calls it instead of loading the address, and the jump control calls it too, while the real addresses stay for a new tab and for no script.
 * Drawn only when there is more than one page.
 */
export function Pager({ page, pages, href, label, say, fmt, onPage, param = "page" }: {
  page: number;
  pages: number;
  href: (page: number) => string;
  /** The `aria-label` of the navigation ("Pages"). */
  label: string;
  say: Speaker["say"];
  fmt: Speaker["fmt"];
  onPage?: (page: number) => void;
  /** The query key that holds the page. */
  param?: string;
}) {
  if (pages <= 1) return null;
  const at = Math.min(Math.max(1, page), pages);
  const here = new URL(href(1), "http://pager.invalid");
  const hidden = [...here.searchParams].filter(([k]) => k !== param);

  const step = (n: number, text: ReactNode, name: string, extra: { rel?: string; className?: string } = {}) => {
    const cls = `pg ${extra.className ?? ""}`.trim();
    const props = { "aria-label": name, title: name, rel: extra.rel, className: cls };
    if (n < 1 || n > pages || n === at) return <span key={name} className={`${cls} off`} aria-disabled="true" title={name}>{text}</span>;
    return onPage ? <a key={name} href={href(n)} {...props} onClick={(e) => press(e, n)}>{text}</a> : <Link key={name} href={href(n)} prefetch={false} {...props}>{text}</Link>;
  };
  const press = (e: MouseEvent<HTMLAnchorElement>, n: number) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onPage?.(n);
  };
  const numbers = (siblings: number, cls: string) => (
    <span className={`pg-nums ${cls}`}>
      {pageWindow(at, pages, siblings).map((n, i) => {
        if (n == null) return <span key={`gap${i}`} className="pg gap" aria-hidden="true">…</span>;
        const name = say("pager.page", { n: fmt(n) });
        if (n === at) return <span key={n} className="pg on" aria-current="page" aria-label={name}>{fmt(n)}</span>;
        return onPage
          ? <a key={n} className="pg" href={href(n)} aria-label={name} onClick={(e) => press(e, n)}>{fmt(n)}</a>
          : <Link key={n} className="pg" href={href(n)} prefetch={false} aria-label={name}>{fmt(n)}</Link>;
      })}
    </span>
  );

  return (
    <div className="pagerbar">
      <nav className="pager" aria-label={label}>
        {step(1, "«", say("pager.first"), { className: "edge" })}
        {step(at - 1, "‹", say("pager.prev"), { rel: "prev" })}
        {numbers(2, "pg-wide")}
        {numbers(1, "pg-narrow")}
        {step(at + 1, "›", say("pager.next"), { rel: "next" })}
        {step(pages, "»", say("pager.last"), { className: "edge" })}
      </nav>
      <PagerJump page={at} pages={pages} action={here.pathname} hidden={hidden} param={param} onJump={onPage} />
    </div>
  );
}
