"use client";

import { useRouter } from "next/navigation";
import { leadersPath } from "@/lib/leaderStats";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The league's seasons, newest first; choosing one opens that season's leaders, keeping the view and the stat. */
export function LeaderSeasonSelect({ lg, seasons, value }: { lg: string; seasons: { year: number; label: string }[]; value: number }) {
  const { say } = useSpeaker();
  const router = useRouter();
  return (
    <select aria-label={say("col.season")} value={value} onChange={(e) => {
      const q = new URLSearchParams(location.search);
      q.delete("sort");
      const s = q.toString();
      router.push(`${leadersPath(lg, Number(e.target.value))}${s ? `?${s}` : ""}`);
    }}>
      {seasons.map((s) => <option key={s.year} value={s.year}>{s.label}</option>)}
    </select>
  );
}
