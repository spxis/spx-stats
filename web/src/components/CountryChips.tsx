"use client";

import { useId, useState } from "react";
import Link from "./Link";
import { useCountryFocus } from "./CountryScope";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { ChipCountry } from "@/lib/countryChips";

/**
 * The country filter of /players as a row of chips, drawn from short arrays: the page sends [code, name, players, 1 when the country has a flag] for each chip
 * and the address once with a marker for the code (`hrefTpl`), not a link, a flag and a title for each of the hundred countries as server markup twice.
 * The biggest countries are in the page's markup (they are the links a reader without script has); "More countries" holds the rest, which are drawn
 * when the list is opened (a closed list is hidden, so nothing is lost).
 */
export function CountryChips({ shown, more, chosen, hrefTpl, clearHref, allLabel, moreLabel }: {
  shown: readonly ChipCountry[]; more: readonly ChipCountry[]; chosen: string;
  /** The list's address with `{code}` where a country goes. */
  hrefTpl: string; clearHref: string; allLabel: string; moreLabel: string;
}) {
  const { say, plural, fmt } = useSpeaker();
  const scope = useCountryFocus();
  const [own, setOwn] = useState(false);
  const open = scope.hasMore ? scope.moreOpen : own;
  const setOpen = scope.hasMore ? scope.setMoreOpen : setOwn;
  const id = useId();
  // Once opened the list stays drawn (closing only hides it).
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  const chip = ([code, name, n, flag]: ChipCountry) => {
    const on = code === chosen;
    return (
      <Link key={code} href={on ? clearHref : hrefTpl.replace("{code}", code)} prefetch={false} aria-current={on ? "true" : undefined} data-country={code} title={`${name}: ${plural("count.players", n)}`}>
        {flag ? <FlagIcon code={code} shape="round" name={name} label={say("flag.of", { name })} /> : null}{name}<span className="n">{fmt(n)}</span>
      </Link>
    );
  };
  return (
    <nav className="pchips" aria-label={say("players.whereChips")}>
      <Link className="pall" href={clearHref} prefetch={false} aria-current={chosen ? undefined : "true"}>{allLabel}</Link>
      {shown.map(chip)}
      {more.length ? (
        <>
          <button type="button" className="pmore" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{moreLabel}</button>
          <div className="pchips pmore-list" id={id} hidden={!open}>{wanted ? more.map(chip) : null}</div>
        </>
      ) : null}
    </nav>
  );
}
