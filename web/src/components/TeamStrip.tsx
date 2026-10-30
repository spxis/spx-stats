"use client";

import { SoccerFlag } from "@/components/SoccerFlag";
import { soccerTeamPath } from "@/lib/soccerPath";
import type { StripLine } from "@/lib/wcStrip";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./tournamentmap.css";

/**
 * Every team of a tournament in one wrapping strip under its heading: a round flag with the team's three-letter code, ringed in the colour of how far it went (the
 * same colours as the map in the page's corner, components/TournamentMap.tsx). A press goes to the team's squad further down the page (`#squad-<code>`, which opens
 * the list: components/LazySquad.tsx), and to the team's own page where the tournament has no squads. The flags are the World Cup pages' own (the one cached file
 * of round flags), a link's name and its stage are in its label, and nothing here needs script: the address does the jump. A client component taking one short line a team
 * (lib/wcStrip.ts): drawn on the server each chip was 500 bytes of the page's payload as well as its markup.
 */
export function TeamStrip({ teams, title }: { teams: readonly StripLine[]; title: string }) {
  const { say } = useSpeaker();
  if (!teams.length) return null;
  return (
    <nav className="wcstrip" aria-label={say("wc.strip.aria", { title })}>
      <ul>
        {teams.map(([id, anchor, code, slug, squad, name, flag, stage, tier]) => {
          const label = say("wc.strip.team", { team: name, stage });
          return (
            <li key={id}>
              <a className={`wcchip t${tier}`} href={squad ? `#${anchor}` : soccerTeamPath(slug)} aria-label={label} title={label}>
                <SoccerFlag code={flag} />
                <span>{code}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
