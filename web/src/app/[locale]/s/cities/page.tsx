import type { Metadata } from "next";
import { flag } from "@johnmorrisdotca/hata/load";
import { CityExplorer, type CityListRow } from "@/components/CityExplorer";
import { getCityData } from "@/lib/cityData";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import "@/components/alignment.css";
import "@/components/city.css";

// A kept page: the search, the year range and the sort are all done in the browser, so the address never carries a query this page reads.

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("cities.title"), description: say("cities.metaDesc"), path: "/cities", locale });
});

export default guard(async function CitiesPage() {
  const { say } = await currentSpeaker();
  const { cities, stays } = await getCityData();
  const rows: CityListRow[] = cities.flatMap((c) => {
    const mine = stays.filter((s) => s.city === c.slug);
    if (!mine.length) return [];
    const per = new Map<number, number[]>();
    for (const s of mine) for (const [y, champ, w, l, t, o] of s.rows) {
      const cur = per.get(y) ?? [0, 0, 0, 0, 0, 0];
      cur[0] += 1; cur[1] += champ; cur[2] += Math.max(w, 0); cur[3] += Math.max(l, 0); cur[4] += t; cur[5] += o;
      per.set(y, cur);
    }
    return [{
      slug: c.slug, name: c.name, nameFr: c.nameFr, region: c.region.split("-")[1] ?? c.region, cc: c.country, lat: c.lat, lon: c.lon,
      metroName: c.metroName, metroNameFr: c.metroNameFr,
      clubs: [...new Set(mine.flatMap((s) => s.names))],
      runs: mine.map((s) => s.runs.flat()),
      yr: [...per].sort((a, b) => a[0] - b[0]).flatMap(([y, v]) => [y, ...v]),
    }];
  });
  const years = rows.flatMap((r) => r.yr.filter((_, i) => i % 7 === 0));
  const flags: Record<string, string> = {};
  for (const cc of ["CA", "US"]) { const svg = await flag(cc).catch(() => null); if (svg) flags[cc] = svg; }
  return (
    <>
      <section className="head fade">
        <h1>{say("cities.title")}</h1>
        <p className="lede">{say("cities.lede")}</p>
      </section>
      <section className="section">
        {rows.length ? <CityExplorer cities={rows} min={Math.min(...years)} max={Math.max(...years)} flags={flags} /> : <p className="note">{say("cities.none")}</p>}
      </section>
    </>
  );
});
