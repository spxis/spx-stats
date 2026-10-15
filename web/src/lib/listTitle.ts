/**
 * The heading and document title of a list page, said with the filters that are on, so a reader can see the list is filtered ("NHL players from
 * Russia", "Houston Rockets players", "NHL teams · Eastern Conference"). Only the choices that take rows out of the list are named: the league,
 * the team, the country, and (for teams) the conference, division and status. The letter, a name search, the years and the sort stay out of it;
 * the controls are still where a choice is made. Pure, so a node script can test it in every language.
 */
import type { PhraseKey } from "./i18n/phrases.constants.ts";

type Say = (key: PhraseKey, vars?: Record<string, string>) => string;

/** What narrows the player list. Names are in the reader's language already; a team belongs to a league, so a team makes the league unnecessary. */
export interface PlayerChoices {
  /** The league's short name ("NHL"). */
  league?: string | null;
  /** The club's name ("Houston Rockets"). */
  team?: string | null;
  /** The country's name in the reader's language ("Russia"). */
  country?: string | null;
}

export function playersTitle(say: Say, { league, team, country }: PlayerChoices): string {
  if (team) return country ? say("players.titleTeamCountry", { team, country }) : say("players.titleTeam", { team });
  if (league) return country ? say("players.titleLeagueCountry", { league, country }) : say("players.titleLeague", { league });
  return country ? say("players.titleCountry", { country }) : say("players.title");
}

/** What narrows the team list. */
export interface TeamChoices {
  /** The league's short name ("NHL"). */
  league?: string | null;
  /** The name of the division chosen, else of the conference chosen. */
  place?: string | null;
  /** Only the teams still playing ("active") or only the ones that are gone ("defunct"); anything else is all of them. */
  status?: string | null;
}

const SEP = " · ";

export function teamsTitle(say: Say, { league, place, status }: TeamChoices): string {
  const head = league ? say("teams.titleLeague", { league }) : say("teams.title");
  const tail = [place || null, status === "active" ? say("teams.statusActive") : status === "defunct" ? say("teams.statusDefunct") : null];
  return [head, ...tail.filter((t): t is string => !!t)].join(SEP);
}
