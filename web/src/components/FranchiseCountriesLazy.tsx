"use client";

import Link from "@/components/Link";
import { countriesRestPath, type FranchiseCountryView } from "@/lib/countryView";
import { FranchiseCountriesView } from "./FranchiseCountriesView";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useFetchedJson } from "./useFetchedJson";
import { useSeen } from "./useSeen";

/**
 * The body of a franchise's "Where the players come from" section (donut, map, the countries over the seasons, the rankers), fetched when the reader
 * gets near it. The page carries the heading and the first sentence; the rest, with its two charts and its tables, was over 100 KB of markup
 * and again in the payload, for a section far down the page. The data is one kept JSON answer per franchise. Without script the section links to the world page.
 */
export function FranchiseCountriesLazy({ lg, teamPath }: { lg: string; teamPath: string }) {
  const { say } = useSpeaker();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const { state, data } = useFetchedJson<FranchiseCountryView>(countriesRestPath(teamPath), "view", seen);
  if (data) return <FranchiseCountriesView lg={lg} view={data} />;
  return (
    <div ref={ref} style={{ minHeight: state === "failed" ? undefined : 900 }}>
      {state === "loading" ? <p className="note" role="status">{say("load.loading")}</p> : null}
      <p className="note"><Link href={`/${lg}/world`} prefetch={false}>{say("country.leagueLink", { league: lg.toUpperCase() })}</Link> · <Link href="/countries" prefetch={false}>{say("country.allLink")}</Link></p>
    </div>
  );
}
