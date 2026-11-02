"use client";

import Link from "@/components/Link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SoccerFlag } from "@/components/SoccerFlag";
import { SoccerSquadTable } from "@/components/SoccerSquadTable";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import { teamName } from "@/lib/soccerNames";
import { soccerTeamPath } from "@/lib/soccerPath";
import { squadPath, squadRowsPath, type SquadLabels, type SquadLine } from "@/lib/soccerSquad";
import "./soccer.css";

/** One team of the picker as the page sends it: [anchor (`squad-<code>`), slug, name, flag]. */
export type PickerTeam = [anchor: string, slug: string, name: string, flag: string | null];

type Load = { state: "failed" } | { state: "done"; lines: SquadLine[] };

const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
const hashNow = () => window.location.hash.replace(/^#/, "");

/**
 * The squads of a tournament: a grid of the teams and, under it, the squad of the one chosen, so the choice and its table are on one screen. The choice is
 * the address's fragment (`#squad-<code>`, the same address the strip under the heading and the map in its corner lead to), so a page that stays kept
 * and drawn once for everyone still has a link to each squad. A squad is fetched from its own kept address the first time its team is chosen and
 * stays here after (a few kilobytes of JSON). Each team in the grid is a real link to the squad's own page, which is what a reader without script follows.
 */
export function SquadPicker({ year, teams, labels, texts }: {
  year: number; teams: readonly PickerTeam[]; labels: SquadLabels;
  texts: { loading: string; failed: string; open: string; choose: string; aria: string };
}) {
  const { locale } = useSpeaker();
  const hash = useSyncExternalStore(subscribe, hashNow, () => "");
  const chosen = teams.find((t) => t[0] === hash) ?? null;
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const asked = useRef(new Set<string>());
  const panel = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const slug = chosen?.[1] ?? null;

  useEffect(() => {
    if (!slug || asked.current.has(slug)) return;
    asked.current.add(slug);
    void (async () => {
      try {
        const res = await fetch(squadRowsPath(year, slug), { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { lines?: SquadLine[] };
        if (!Array.isArray(body.lines)) throw new Error("no squad");
        setLoads((l) => ({ ...l, [slug]: { state: "done", lines: body.lines! } }));
      } catch {
        asked.current.delete(slug); // choosing it again tries again
        setLoads((l) => ({ ...l, [slug]: { state: "failed" } }));
      }
    })();
  }, [slug, year]);

  // An address that names a team (the strip's links, the map's jump) brings the squads into view; a press in the grid does not move the page.
  useEffect(() => {
    if (!slug) return;
    if (pressed.current) pressed.current = false;
    else panel.current?.scrollIntoView({ block: "start" });
  }, [slug]);

  function choose(e: React.MouseEvent, anchor: string, teamSlug: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    pressed.current = true;
    if (loads[teamSlug]?.state === "failed") setLoads((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== teamSlug)));
    window.history.replaceState(null, "", `#${anchor}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const load = slug ? loads[slug] : undefined;
  const label = (t: PickerTeam) => teamName({ name: t[2], slug: t[1], flag: t[3] }, locale);
  return (
    <>
      <nav className="sqpick" aria-label={texts.aria}>
        <ul>
          {teams.map((t) => (
            <li key={t[0]}>
              <a href={squadPath(year, t[1])} aria-current={chosen === t ? "true" : undefined} onClick={(e) => choose(e, t[0], t[1])}>
                <SoccerFlag code={t[3]} />
                <span>{label(t)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sqpanel" ref={panel} aria-live="polite">
        {chosen ? (
          <>
            <h3><SoccerFlag code={chosen[3]} name={label(chosen)} /> <Link href={soccerTeamPath(chosen[1])} prefetch={false}>{label(chosen)}</Link></h3>
            {load?.state === "done" ? <SoccerSquadTable lines={load.lines} labels={labels} /> : (
              <p className="note">
                {load?.state === "failed" ? <>{texts.failed} <Link href={squadPath(year, chosen[1])} prefetch={false}>{texts.open}</Link></> : texts.loading}
              </p>
            )}
          </>
        ) : <p className="note">{texts.choose}</p>}
      </div>
    </>
  );
}
