"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { LEAGUES } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";

/** Pages that mean the same in every league, so switching league keeps their date or view. */
const SHARED = new Set(["scores", "all-time"]);

export function LeagueNav() {
  const { say } = useSpeaker();
  const router = useRouter();
  const parts = usePathname().split("/");
  const current = parts[1];
  const keep = SHARED.has(parts[2] ?? "");
  const go = (e: MouseEvent, code: string) => {
    if (!keep || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.push(`/${[code, ...parts.slice(2)].join("/")}${location.search}`);
  };
  return (
    <nav className="leagues" id="league-nav" aria-label={say("nav.leagues")}>
      {LEAGUES.map((l) => (
        <Link key={l.code} href={`/${l.code}`} onClick={(e) => go(e, l.code)} aria-current={current === l.code ? "page" : undefined}>
          {l.short}
        </Link>
      ))}
      {LEAGUES.some((l) => l.code === current) ? (
        <>
          <Link className="sub" href={`/${current}/scores`} aria-current={parts[2] === "scores" ? "page" : undefined}>{say("nav.scores")}</Link>
          <Link className="sub" href={`/${current}/all-time`} aria-current={parts[2] === "all-time" ? "page" : undefined}>{say("nav.allTime")}</Link>
        </>
      ) : null}
    </nav>
  );
}
