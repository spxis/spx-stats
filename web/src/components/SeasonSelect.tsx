"use client";

import { useRouter } from "next/navigation";
import { leadersPath } from "@/lib/leaderStats";
import { seasonPath } from "@/lib/slug";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The pages a season picker can open, and the query parameters that belong to the page being left (dropped on the way). */
const PAGES = {
  season: { path: seasonPath, drop: ["date", "all", "team", "month", "day", "phase"] },
  leaders: { path: leadersPath, drop: ["sort"] },
} as const;

export type SeasonPage = keyof typeof PAGES;

/** The league's seasons, newest first; choosing one opens the same kind of page for that season, keeping the rest of the address. */
export function SeasonSelect({ lg, page, seasons, value }: { lg: string; page: SeasonPage; seasons: { year: number; label: string }[]; value: number }) {
  const { say } = useSpeaker();
  const router = useRouter();
  return (
    <select aria-label={say("col.season")} value={value} onChange={(e) => {
      const q = new URLSearchParams(location.search);
      for (const k of PAGES[page].drop) q.delete(k);
      const s = q.toString();
      router.push(`${PAGES[page].path(lg, Number(e.target.value))}${s ? `?${s}` : ""}`);
    }}>
      {seasons.map((s) => <option key={s.year} value={s.year}>{s.label}</option>)}
    </select>
  );
}
