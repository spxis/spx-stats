"use client";

import Link from "next/link";
import { pairPath, pairSeasonPath } from "@/lib/h2h";
import { seasonLabel } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import "./h2h.css";

/** A row's way to the pair's head-to-head page for that season. Shown when the row is hovered or focused (always on a touch screen). */
export function H2hLink({ lg, year, a, b }: { lg: string; year: number; a: number | null | undefined; b: number | null | undefined }) {
  const paths = usePaths();
  const { say } = useSpeaker();
  if (a == null || b == null || a === b) return null;
  const href = pairSeasonPath(pairPath(paths, lg, a, b).path, seasonLabel(lg, year));
  return (
    <Link className="h2hlink" href={href} prefetch={false} title={say("h2h.linkTitle")}>
      <span className="tn-long">{say("h2h.link")}</span>
      <abbr className="tn-short" title={say("h2h.link")}>{say("h2h.linkShort")}</abbr>
    </Link>
  );
}
