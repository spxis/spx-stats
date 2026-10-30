import type { Metadata } from "next";
import Link from "@/components/Link";
import { CountriesFirsts } from "@/components/CountriesTables";
import { Credits } from "@/components/Credits";
import { firstsWire, getCountriesData } from "@/lib/countriesData";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import "@/components/country.css";

export const revalidate = 86400;

/**
 * Every row of the table on /countries, on a page of its own: the "Show all" of that page is a link here where script is off. The same table, with every
 * row in it.
 */
export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("country.firstsTitle"), description: say("country.firstsNote"), path: "/countries/firsts", locale });
});

export default guard(async function CountriesFirstsPage() {
  const { say } = await currentSpeaker();
  const d = await getCountriesData();
  return (
    <>
      <section className="head fade">
        <h1>{say("country.firstsTitle")}</h1>
        <p className="note">{say("country.firstsNote")}</p>
        <p className="note"><Link href="/countries">{say("country.allLink")}</Link></p>
      </section>
      {d ? (
        <section className="section">
          <CountriesFirsts wire={await firstsWire(d)} flags={d.flags} full hrefAll="/countries/firsts" label={say("country.firstsTitle")} />
        </section>
      ) : <p className="note">{say("country.notLoaded")}</p>}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps", "flags"]} /></p>
    </>
  );
});
