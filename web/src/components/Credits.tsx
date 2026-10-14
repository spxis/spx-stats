import { Fragment, type ReactNode } from "react";
import type { Speaker } from "@/lib/i18n/i18n";
import { Rich } from "./i18n/Rich";

/**
 * The credits for John's libraries and the data behind them: the one place that says who made what, so every page that
 * draws a map, a flag or a formatted address says it the same way, with both links (npm and GitHub) for the library.
 * Plain markup with no server-only code: pages and client components both use it, handing over their own `say`.
 */

/** John's libraries. */
export type Lib = "chizu" | "hata" | "address-plus" | "kyogijo-stadiums";

const SCOPE = "@johnmorrisdotca";
export const npmUrl = (lib: Lib) => `https://www.npmjs.com/package/${SCOPE}/${lib}`;
export const githubUrl = (lib: Lib) => `https://github.com/johnmorrisdotca/${lib}`;

/** The data behind the libraries that has to be named too. */
export const NATURAL_EARTH_URL = "https://www.naturalearthdata.com";
export const COMMONS_URL = "https://commons.wikimedia.org";

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** How a library is named in a credit: its package name, except Kyogijo Stadiums, which is a product name. */
const LIB_NAME: Partial<Record<Lib, string>> = { "kyogijo-stadiums": "Kyogijo Stadiums" };

/** One library as "name (npm · GitHub)". The link labels are the names of those sites, so they are the same in every language. */
export function LibCredit({ lib }: { lib: Lib }) {
  return <>{LIB_NAME[lib] ?? lib} ({link(npmUrl(lib), "npm")} · {link(githubUrl(lib), "GitHub")})</>;
}

/** What a page can credit: the map (Chizu and Natural Earth), the flags (Hata and Wikimedia Commons), the formatted addresses (address-plus), the playing surfaces (Kyogijo Stadiums). */
export type CreditKind = "maps" | "flags" | "addresses" | "surfaces";

/** The credit sentences for `use`, side by side, in the reader's language. Put it in a `<p className="note">`. */
export function Credits({ say, use }: { say: Speaker["say"]; use: readonly CreditKind[] }) {
  const sentence: Record<CreditKind, ReactNode> = {
    maps: <Rich text={say("credit.maps")} parts={{ chizu: <LibCredit lib="chizu" />, naturalEarth: link(NATURAL_EARTH_URL, "Natural Earth") }} />,
    flags: <Rich text={say("credit.flags")} parts={{ hata: <LibCredit lib="hata" />, commons: link(COMMONS_URL, "Wikimedia Commons") }} />,
    addresses: <Rich text={say("address.credit")} parts={{ link: <LibCredit lib="address-plus" /> }} />,
    surfaces: <Rich text={say("credit.surfaces")} parts={{ kyogijo: <LibCredit lib="kyogijo-stadiums" /> }} />,
  };
  return (
    <>
      {use.map((k, i) => <Fragment key={k}>{i ? " " : null}{sentence[k]}</Fragment>)}
    </>
  );
}
