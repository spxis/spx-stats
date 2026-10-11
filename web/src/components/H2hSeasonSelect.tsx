"use client";

import { useRouter } from "next/navigation";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The seasons in which the pair met, newest first, and "All seasons". Choosing one reloads the page with ?season= (the other choices kept). */
export function H2hSeasonSelect({ seasons, value }: { seasons: { label: string }[]; value: string }) {
  const { say } = useSpeaker();
  const router = useRouter();
  return (
    <select aria-label={say("col.season")} value={value} onChange={(e) => {
      const q = new URLSearchParams(location.search);
      q.delete("sort_games");
      q.delete("sort_seasons");
      q.delete("list");
      if (e.target.value) q.set("season", e.target.value); else q.delete("season");
      const s = q.toString();
      router.push(`${location.pathname}${s ? `?${s}` : ""}`, { scroll: false });
    }}>
      <option value="">{say("h2h.allSeasons")}</option>
      {seasons.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
    </select>
  );
}
