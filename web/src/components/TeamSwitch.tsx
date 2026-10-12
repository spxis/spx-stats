"use client";

import { useRouter } from "next/navigation";
import { useSpeaker } from "./i18n/LocaleProvider";

/** A plain team picker for a team page: choosing a club goes to that club's page (the Compare button is the side-by-side view). */
export function TeamSwitch({ current, options }: { current: string; options: { name: string; href: string }[] }) {
  const { say } = useSpeaker();
  const router = useRouter();
  return (
    <select className="teamswitch" aria-label={say("team.switch")} value={current} onChange={(e) => router.push(e.target.value)}>
      {options.map((o) => <option key={o.href} value={o.href}>{o.name}</option>)}
    </select>
  );
}
