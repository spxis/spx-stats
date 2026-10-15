import { SoccerFlag } from "@/components/SoccerFlag";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { soccerTeamPath } from "@/lib/soccerPath";
import type { StripTeam } from "@/lib/soccerStrip";
import "./tournamentmap.css";

/**
 * Every team of a tournament in one wrapping strip under its heading: a round flag with the team's three-letter code, ringed in the colour of how far it went (the
 * same colours as the map in the page's corner, components/TournamentMap.tsx). A press goes to the team's squad further down the page (`#squad-<code>`, which opens
 * the list: components/LazySquad.tsx), and to the team's own page where the tournament has no squads. The flags are the World Cup pages' own (the one cached file
 * of round flags), a link's name and its stage are in its label, and nothing here needs script: the address does the jump.
 */
export async function TeamStrip({ teams, title }: { teams: readonly StripTeam[]; title: string }) {
  const { say } = await currentSpeaker();
  if (!teams.length) return null;
  return (
    <nav className="wcstrip" aria-label={say("wc.strip.aria", { title })}>
      <ul>
        {teams.map((t) => (
          <li key={t.id}>
            <a className={`wcchip t${t.tier}`} href={t.squad ? `#${t.anchor}` : soccerTeamPath(t.slug)} aria-label={say("wc.strip.team", { team: t.name, stage: t.stage })} title={say("wc.strip.team", { team: t.name, stage: t.stage })}>
              <SoccerFlag code={t.flag} />
              <span>{t.code}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
