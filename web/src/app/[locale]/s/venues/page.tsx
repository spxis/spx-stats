import type { Metadata } from "next";
import { VenueDownload } from "@/components/VenueDataLinks";
import { VenueExplorer } from "@/components/VenueExplorer";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPaths } from "@/lib/teamSlugs";
import { venueCountryName } from "@/lib/venueCountry";
import { getVenueList } from "@/lib/venueList";
import { isSoccerLeague, SOCCER_NAME_KEY } from "@/lib/venueSoccerRows";
import { packVenues } from "@/lib/venueWire";
import "@/components/alignment.css";
import "@/components/city.css";

// A kept page: the rows go to the browser once, packed (venueWire.ts); the filters, the year range and the sort are all done in the browser (the address carries them, read once the page is on screen), so no query is read here.

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("venuesPage.title"), description: say("venuesPage.metaDesc"), path: "/venues", locale });
});

export default guard(async function VenuesPage() {
  const speaker = await currentSpeaker();
  const { say } = speaker;
  const { rows, leagues } = await getVenueList(await getPaths(), say, speaker.locale);
  // The year slider spans the years venues were used; a venue not built yet has none.
  const known = rows.filter((v) => v.kind !== "future").flatMap((v) => [v.from, v.to]).filter((y): y is number => y != null);
  const min = known.length ? Math.min(...known) : 1900;
  const max = Math.max(new Date().getFullYear(), ...known);
  const wire = packVenues(rows, leagues, (cc) => venueCountryName(cc, speaker));
  const labels = Object.fromEntries(leagues.map((l) => [l, isSoccerLeague(l) ? say(SOCCER_NAME_KEY[l]) : (LG as Record<string, string>)[l] ?? l.toUpperCase()]));
  return (
    <>
      <section className="head fade">
        <h1>{say("venuesPage.title")}</h1>
        <p className="lede">{say("venuesPage.lede")}</p>
        <VenueDownload say={say} />
      </section>
      <section className="section">
        {rows.length ? <VenueExplorer wire={wire} leagues={leagues} labels={labels} min={min} max={max} /> : <p className="note">{say("venuesPage.none")}</p>}
      </section>
    </>
  );
});
