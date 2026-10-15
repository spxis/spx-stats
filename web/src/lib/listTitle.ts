/**
 * The heading and document title of a list page, said with the filters that are on. The page word ("Players", "Teams") never changes; the filters
 * come after it as a suffix ("Players · NHL · from Russia", "Teams · NHL · Eastern Conference · Active"), which the heading draws smaller and muted.
 * Only the choices that take rows out of the list are named: the league, the team, the country, and (for teams) the conference, division and
 * status. The letter, a name search, the years and the sort stay out of it; the controls are still where a choice is made. Pure, so a node
 * script can test it in every language.
 */
import type { PhraseKey } from "./i18n/phrases.constants.ts";

type Say = (key: PhraseKey, vars?: Record<string, string>) => string;

const SEP = " · ";

/** What narrows the player list. Names are in the reader's language already; a team belongs to a league, so a team makes the league unnecessary. */
export interface PlayerChoices {
  /** The league's short name ("NHL"). */
  league?: string | null;
  /** The club's name ("Houston Rockets"). */
  team?: string | null;
  /** The country's name in the reader's language ("Russia"). */
  country?: string | null;
}

/** The filter parts that follow "Players", in the order a reader narrows them: the team (else the league), then the country. */
export function playersFilters(say: Say, { league, team, country }: PlayerChoices): string[] {
  return [team || league || null, country ? say("players.fromCountry", { country }) : null].filter((t): t is string => !!t);
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

/** The filter parts that follow "Teams": the league, the division or conference, active or defunct. */
export function teamsFilters(say: Say, { league, place, status }: TeamChoices): string[] {
  const parts = [league || null, place || null, status === "active" ? say("teams.statusActive") : status === "defunct" ? say("teams.statusDefunct") : null];
  return parts.filter((t): t is string => !!t);
}

/** The tab's title: the page word, then the filters ("Players · NHL · from Russia"). */
export function listTitle(head: string, filters: string[]): string {
  return [head, ...filters].join(SEP);
}

/** What a screen reader says for the heading: "Players, filtered: NHL, from Russia" (just the word when nothing is filtered). */
export function listLabel(say: Say, head: string, filters: string[]): string {
  return filters.length ? say("list.filtered", { title: head, filters: filters.join(", ") }) : head;
}
