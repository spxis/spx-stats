import { FranchiseCountriesLazy } from "@/components/FranchiseCountriesLazy";
import { franchiseCountryView } from "@/lib/franchiseCountryData";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

/**
 * "Where the players come from" on a franchise's page (migration 068's views; the section is left out while they are missing): the heading and a
 * sentence in the page, and below them a donut of everyone who played for the club by country, a world map of the same, the countries over the
 * seasons as a stacked area, and the country ranker over all its seasons, which the browser fetches when the reader gets near
 * (components/FranchiseCountriesLazy.tsx; the data is worked out in lib/franchiseCountryData.ts). A country in the map links to its page.
 */
export async function FranchiseCountries({ lg, f, name, teamPath }: { lg: string; f: number; name: string; teamPath: string }) {
  const view = await franchiseCountryView(lg, f, name);
  if (!view) return null;
  const { say, plural, fmt } = await currentSpeaker();
  return (
    <section className="section" id="countries">
      <h2>{say("country.teamTitle")}</h2>
      <p className="note">{say("country.franchiseLede", { known: plural("count.players", view.known), total: fmt(view.total), countries: plural("count.countries", view.countries) })}</p>
      <FranchiseCountriesLazy lg={lg} teamPath={teamPath} />
    </section>
  );
}
