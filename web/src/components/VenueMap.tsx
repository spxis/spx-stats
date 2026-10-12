"use client";

import { useMemo, useState } from "react";
import { replaceQuery } from "@/lib/urlQuery";
import type { VenueTeam } from "@/lib/venueMap";
import type { Pin } from "./mapDraw";
import { MapViewer } from "./MapViewer";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./mapviewer.css";

export type VenueTab = "league" | "history";

/**
 * The map under HOME VENUES on a team page. "League venues" shows where every club of the team's last season plays, the
 * chosen team marked; "Historic venues" shows every venue the chosen team has used. The tab and the team are in the
 * address (?map=history&team=<slug>), so a view can be shared.
 */
export function VenueMap({ league, teams, slug, leagueShort, seasonLabel, clubCount, tab: tab0, team: team0 }: {
  league: Pin[] | null; teams: VenueTeam[]; slug: string; leagueShort: string; seasonLabel: string; clubCount: number; tab: VenueTab; team: string;
}) {
  const { say } = useSpeaker();
  const [tab, setTab] = useState<VenueTab>(league ? tab0 : "history");
  const [team, setTeam] = useState(teams.some((t) => t.slug === team0) ? team0 : slug);
  const [stop, setStop] = useState<number | null>(null);
  const chosen = teams.find((t) => t.slug === team) ?? teams[0];

  const go = (t: VenueTab, s: string) => {
    setTab(t); setTeam(s); setStop(null);
    replaceQuery({ map: t === "league" ? null : t, team: s === slug ? null : s });
  };

  const pins = useMemo<Pin[]>(() => {
    if (tab === "league") return league ?? [];
    const stops = chosen?.venues ?? [];
    const open = stops.findLastIndex((v) => !v.to);
    const now = open >= 0 ? open : stops.length - 1;
    return stops.map((v, i) => ({
      f: i, name: v.venue, lat: v.lat, lon: v.lon, cc: v.cc, place: v.place, wiki: v.wiki, me: i === now, team: chosen?.name, teamHref: chosen?.href,
      venue: `${v.from?.slice(0, 4) ?? "…"}–${v.to?.slice(0, 4) ?? say("team.today")}`,
    }));
  }, [tab, league, chosen, say]);
  const current = tab === "league" ? chosen?.f : stop ?? pins.find((p) => p.me)?.f;
  const pick = (f: number) => {
    if (tab === "history") { setStop(f); return; }
    const t = teams.find((x) => x.f === f);
    if (t) go("league", t.slug);
  };

  const note = tab === "league"
    ? say("venues.leagueNote", { n: pins.length, league: leagueShort, season: seasonLabel })
    : say("venues.historyNote", { n: pins.length });
  const bar = (
    <>
      {league ? (
        <div className="seg" role="group" aria-label={say("venues.tabs")}>
          <button type="button" aria-pressed={tab === "league"} onClick={() => go("league", team)}>{say("venues.tabLeague")}</button>
          <button type="button" aria-pressed={tab === "history"} onClick={() => go("history", team)}>{say("venues.tabHistory")}</button>
        </div>
      ) : null}
      {teams.length > 1 ? (
        <select aria-label={say("venues.team")} value={chosen?.slug} onChange={(e) => go(tab, e.target.value)}>
          {teams.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      ) : null}
    </>
  );

  return (
    <div className="venuemap">
      <MapViewer pins={pins} title={say("venues.mapTitle", { league: leagueShort })} total={tab === "league" ? clubCount : pins.length} note={note} bar={bar} selected={current} onPick={pick} />
    </div>
  );
}
