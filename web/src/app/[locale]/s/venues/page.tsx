import type { Metadata } from "next";
import { VenueExplorer } from "@/components/VenueExplorer";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPaths } from "@/lib/teamSlugs";
import { getVenueList } from "@/lib/venueList";
import { packVenues } from "@/lib/venueWire";
import { COUNTRY_KEY } from "@/components/countryKey";
import "@/components/alignment.css";
import "@/components/city.css";

// A kept page: the rows go to the browser once, packed (venueWire.ts); the filters, the year range and the sort are all done in the browser (the address carries them, read once the page is on screen), so no query is read here.

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("venuesPage.title"), description: say("venuesPage.metaDesc"), path: "/venues", locale });
});

export default guard(async function VenuesPage() {
  const { say } = await currentSpeaker();
  const { rows, leagues } = await getVenueList(await getPaths(), say);
  const known = rows.flatMap((v) => [v.from, v.to]).filter((y): y is number => y != null);
  const min = known.length ? Math.min(...known) : 1900;
  const max = Math.max(new Date().getFullYear(), ...known);
  const wire = packVenues(rows, leagues, (cc) => (COUNTRY_KEY[cc] ? say(COUNTRY_KEY[cc]) : cc));
  const labels = Object.fromEntries(leagues.map((l) => [l, (LG as Record<string, string>)[l] ?? l.toUpperCase()]));
  return (
    <>
      <section className="head fade">
        <h1>{say("venuesPage.title")}</h1>
        <p className="lede">{say("venuesPage.lede")}</p>
      </section>
      <section className="section">
        {rows.length ? <VenueExplorer wire={wire} leagues={leagues} labels={labels} min={min} max={max} /> : <p className="note">{say("venuesPage.none")}</p>}
      </section>
    </>
  );
});
