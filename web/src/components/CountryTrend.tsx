"use client";

import Link from "@/components/Link";
import { useEffect, useId, useState } from "react";
import { countriesTrendPath } from "@/lib/countryLines";
import { countryName } from "@/lib/people-format";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { ShareLines, type ShareSeries } from "./ShareLines";
import { useSeen } from "./useSeen";
import "./country.css";

/** The height of the chart, its legend and the "Show as a table" line before they are drawn, so the page below does not jump. */
const TREND_HEIGHT = 340;

/**
 * A country picker over the trend chart: the country's share of each league's players, decade by decade. The decades of the offered countries come
 * from one kept answer (`/countries/rows/trend`) fetched when the reader gets near, so the page itself does not carry them; without script each
 * country is a link to its own page.
 */
export function CountryTrend({ codes, flags, initial }: { codes: string[]; flags: Record<string, true>; initial: string }) {
  const { say, locale } = useSpeaker();
  const id = useId();
  const [code, setCode] = useState(initial);
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [data, setData] = useState<Record<string, ShareSeries[]> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!seen || data) return;
    let live = true;
    fetch(countriesTrendPath, { headers: { accept: "application/json" } })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json() as Promise<{ data?: Record<string, ShareSeries[]> }>; })
      .then((got) => { if (!got.data) throw new Error("no data"); if (live) setData(got.data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [seen, data]);
  const sorted = [...codes].sort((a, b) => countryName(a, locale).localeCompare(countryName(b, locale), locale));
  const name = countryName(code, locale);
  return (
    <div className="section" ref={ref}>
      <div className="controls">
        <label htmlFor={id}>{say("country.trendPick")}</label>
        <select id={id} value={code} onChange={(e) => setCode(e.target.value)}>
          {sorted.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
        </select>
        {flags[code] ? <FlagIcon code={code} /> : null}
      </div>
      {data ? <ShareLines series={data[code] ?? []} label={say("country.trendAria", { name })} tableLabel={say("country.showTable")} /> : <div style={{ minHeight: TREND_HEIGHT }}>{failed ? <p className="note">{say("load.failed")}</p> : null}</div>}
      <noscript>
        <p className="note">{sorted.map((c, i) => <span key={c}>{i ? " · " : ""}<Link href={`/country/${c}`}>{countryName(c, locale)}</Link></span>)}</p>
      </noscript>
    </div>
  );
}
