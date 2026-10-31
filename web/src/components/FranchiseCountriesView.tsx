"use client";

import Link from "@/components/Link";
import { CountryArea } from "./CountryArea";
import { CountryDonut } from "./CountryDonut";
import { CountryMapDialog } from "./CountryMapDialog";
import { CountryRanker } from "./CountryRanker";
import { CountryScope } from "./CountryScope";
import { Credits } from "./Credits";
import { useSpeaker } from "./i18n/LocaleProvider";
import { MIN_PLAYERS } from "@/lib/countryModel";
import type { FranchiseCountryView } from "@/lib/countryView";
import "./country.css";

const TEMPLATE = "/country/{code}";

/** The body of a franchise's "Where the players come from" section, drawn in the browser from the data the section fetched (the heading and the first sentence are in the page). */
export function FranchiseCountriesView({ lg, view }: { lg: string; view: FranchiseCountryView }) {
  const { say, plural, fmt } = useSpeaker();
  const title = say("country.franchiseMapTitle", { name: view.name });
  return (
    <CountryScope>
      <div className="chartrow">
        <CountryDonut title={say("country.franchiseDonut")} slices={view.slices} flags={view.flags} centre={fmt(view.total)} centreSub={say("country.players")} hrefTpl={TEMPLATE} />
        <div>
          <h3>{say("country.mapHead")}</h3>
          <CountryMapDialog counts={view.counts} flags={view.flags} hrefTpl={TEMPLATE} title={title} caption={say("country.mapCaption")} unit="players" />
        </div>
      </div>
      <h3>{say("country.areaTitle")}</h3>
      <p className="note">{say("country.areaNote")}</p>
      <CountryArea stack={view.stack} league={lg} label={say("country.areaAria", { name: view.name })} tableLabel={say("country.showTable")} deferTable />
      {view.limited ? <p className="note cnote-cov">{say("country.lowRoster", { known: fmt(view.known), total: fmt(view.total) })}</p> : null}
      {view.ranked.length ? (
        <>
          <h3>{say("country.rankHead")}</h3>
          <p className="note">{say("country.rankNoteAll", { n: fmt(MIN_PLAYERS) })}</p>
          {view.ranked.map(({ k, result }) => <CountryRanker key={k} kind={k} result={result} hrefTpl={TEMPLATE} min={MIN_PLAYERS} flags={view.flags} />)}
        </>
      ) : null}
      <p className="note">{say("country.noteSource")} <Credits say={say} use={["maps"]} /></p>
      {view.unknown ? <p className="note">{say("country.unknownNote", { n: plural("count.players", view.unknown) })}</p> : null}
      <p className="note"><Link href={`/${lg}/world`} prefetch={false}>{say("country.leagueLink", { league: lg.toUpperCase() })}</Link> · <Link href="/countries" prefetch={false}>{say("country.allLink")}</Link></p>
    </CountryScope>
  );
}
