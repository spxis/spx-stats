"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEAGUES } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";

export function LeagueNav() {
  const { say } = useSpeaker();
  const parts = usePathname().split("/");
  const current = parts[1];
  return (
    <nav className="leagues" id="league-nav" aria-label={say("nav.leagues")}>
      {LEAGUES.map((l) => (
        <Link key={l.code} href={`/${l.code}`} aria-current={current === l.code ? "page" : undefined}>
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
