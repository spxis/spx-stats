import type { PhraseKey } from "./i18n/phrases.constants";
import type { Speaker } from "./i18n/i18n";
import { sayFor, type Say, type SeriesKey } from "./seriesCopy";

/** The series words that name a playoff round, and the phrase of the site's catalogue that says each in the reader's language. */
const ROUND_PHRASE: Partial<Record<SeriesKey, PhraseKey>> = {
  "round.n": "rnd.n",
  "round.semis": "rnd.semis",
  "round.quarters": "rnd.quarters",
  "final.nhl": "rnd.nhl",
  "final.nba": "rnd.nba",
  "final.mlb": "rnd.mlb",
  "final.nfl": "rnd.nfl",
  "final.nflOld": "rnd.nflOld",
  "final.cfl": "rnd.cfl",
  "final.other": "rnd.other",
};

/**
 * Series words for naming rounds in the reader's language (the series pages still read their words in English; see seriesCopy.ts):
 * the names of the rounds come from the catalogue, any other series word from the series copy.
 */
export const roundSay = (speaker: Speaker): Say => {
  const fallback = sayFor(speaker);
  return (key, vars) => {
    const phrase = ROUND_PHRASE[key];
    return phrase ? speaker.say(phrase, vars) : fallback(key, vars);
  };
};
