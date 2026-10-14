import { COUNTRY_KEY } from "../components/countryKey";
import type { Speaker } from "./i18n/i18n";
import { countryName } from "./people-format";

/** A venue's country in the reader's language: the site's own words for Canada, the United States and Mexico, else the browser's name for the ISO code (a world soccer stadium can be anywhere). */
export const venueCountryName = (cc: string, speaker: Pick<Speaker, "say" | "locale">): string =>
  COUNTRY_KEY[cc.toUpperCase()] ? speaker.say(COUNTRY_KEY[cc.toUpperCase()]) : countryName(cc, speaker.locale);
