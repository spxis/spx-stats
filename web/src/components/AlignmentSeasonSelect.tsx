"use client";

import { useRouter } from "next/navigation";
import { hrefWith } from "@/lib/urlQuery";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./alignment.css";

/** The seasons that have an alignment, newest first; choosing one puts it in the address (?season=). */
export function AlignmentSeasonSelect({ seasons, value }: { seasons: { year: number; label: string }[]; value: number }) {
  const { say } = useSpeaker();
  const router = useRouter();
  return (
    <select aria-label={say("col.season")} value={value} onChange={(e) => router.replace(hrefWith({ season: e.target.value }), { scroll: false })}>
      {seasons.map((s) => <option key={s.year} value={s.year}>{s.label}</option>)}
    </select>
  );
}
