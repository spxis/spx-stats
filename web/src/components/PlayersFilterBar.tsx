import type { ReactNode } from "react";
import Link from "@/components/Link";
import { Flag } from "@/components/Flag";
import { LetterBar } from "@/components/LetterBar";
import { ListRange } from "@/components/ListRange";
import { PlayerCountries } from "@/components/PlayerCountries";
import { SearchBox } from "@/components/SearchBox";
import { SegChips } from "@/components/SegChips";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUES } from "@/lib/leagues";
import type { LetterBy } from "@/lib/listQuery";
import type { Span } from "@/lib/listSpan";
import { countryName } from "@/lib/people-format";
import { coverage, type Tally } from "@/lib/playerCountryModel";
import "@/components/country.css";

export type FilterBarPath = "/players" | "/admin/people";

/**
 * The `/players` filter bar: league chips, search + SEARCH, A–Z, last/first name, country flag chips, year slider.
 * People imports this same module and passes people data (birth-year span, its own href). Do not fork it.
 */
export async function PlayersFilterBar({
  path,
  href,
  league,
  q,
  nat,
  letter,
  letterBy,
  counts,
  countries,
  span,
  range,
  inAddress,
  searchHidden,
  extra,
  teamPicker,
}: {
  path: FilterBarPath;
  href: (changes: Record<string, string | null>) => string;
  league: string;
  q: string;
  nat: string;
  letter: string;
  letterBy: LetterBy;
  counts: ReadonlyMap<string, number> | null;
  countries: Tally | null;
  span: Span | null;
  range: { from: number; to: number } | null;
  inAddress: boolean;
  searchHidden: Record<string, string>;
  extra?: ReactNode;
  teamPicker?: ReactNode;
}) {
  const { say, plural, locale } = await currentSpeaker();
  const leagues: { code: string; short: string }[] = [{ code: "", short: say("phase.all") }, ...LEAGUES.map((l) => ({ code: l.code, short: l.short }))];
  const chipsShown = !!countries && coverage(countries) !== "none";
  return (
    <div className="pfilters">
      <div className="controls">
        <SegChips aria={say("players.leagueAria")} current={league} items={leagues} href={(code) => href({ league: code || null, team: null })} />
        {teamPicker}
        {extra}
        <SearchBox kind="players" action={path} defaultValue={q} league={league} hidden={searchHidden} placeholder={say("players.search")} buttonLabel={say("players.searchGo")} />
      </div>
      <LetterBar say={say} plural={plural} letter={letter} by={letterBy} counts={counts} href={href} />
      {countries ? <PlayerCountries part="chips" t={countries} reference={null} league={league} chosen={nat} href={href} /> : null}
      {nat && !chipsShown ? <p className="note"><Flag code={nat} shape="round" /> {say("players.countryOnly", { name: countryName(nat, locale) })} · <Link href={href({ nat: null })} prefetch={false}>{say("players.countryClear")}</Link></p> : null}
      {span ? <ListRange page={path} min={span.min} max={span.max} from={range?.from ?? span.min} to={range?.to ?? span.max} inAddress={inAddress} /> : null}
    </div>
  );
}
