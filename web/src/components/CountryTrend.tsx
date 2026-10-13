"use client";

import { useId, useState } from "react";
import { countryName } from "@/lib/people-format";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { ShareLines, type ShareSeries } from "./ShareLines";
import "./country.css";

/** A country picker over the trend chart: the country's share of each league's players, decade by decade. `data` holds every offered country's lines. */
export function CountryTrend({ data, flags, initial }: { data: Record<string, ShareSeries[]>; flags: Record<string, string>; initial: string }) {
  const { say, locale } = useSpeaker();
  const id = useId();
  const [code, setCode] = useState(initial);
  const codes = Object.keys(data).sort((a, b) => countryName(a, locale).localeCompare(countryName(b, locale), locale));
  const name = countryName(code, locale);
  return (
    <div className="section">
      <div className="controls">
        <label htmlFor={id}>{say("country.trendPick")}</label>
        <select id={id} value={code} onChange={(e) => setCode(e.target.value)}>
          {codes.map((c) => <option key={c} value={c}>{countryName(c, locale)}</option>)}
        </select>
        {flags[code] ? <FlagIcon svg={flags[code]} /> : null}
      </div>
      <ShareLines series={data[code] ?? []} label={say("country.trendAria", { name })} tableLabel={say("country.showTable")} />
    </div>
  );
}
