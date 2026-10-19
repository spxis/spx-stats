import Link from "@/components/Link";
import { Fragment, type ReactNode } from "react";
import type { Speaker } from "@/lib/i18n/i18n";
import { Rich } from "./i18n/Rich";

/**
 * The credits for John's libraries and the data behind them: the one place that says who made what, so every page that
 * draws a map, a flag or a formatted address says it the same way, with both links (npm and GitHub) for the library.
 * Plain markup with no server-only code: pages and client components both use it, handing over their own `say`.
 */

/** John's libraries. */
export type Lib = "chizu" | "hata" | "address-plus" | "kyogijo-stadiums" | "dougu-sports" | "taisen-brackets" | "senshu-jerseys";

const SCOPE = "@johnmorrisdotca";
export const npmUrl = (lib: Lib) => `https://www.npmjs.com/package/${SCOPE}/${lib}`;
export const githubUrl = (lib: Lib) => `https://github.com/johnmorrisdotca/${lib}`;

/** The data behind the libraries that has to be named too. */
export const NATURAL_EARTH_URL = "https://www.naturalearthdata.com";
export const COMMONS_URL = "https://commons.wikimedia.org";
export const SPORTSLOGOS_URL = "https://www.sportslogos.net";
export const WIKIPEDIA_REUSE_URL = "https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content";
export const CC_BY_SA_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

/** How a library is named in a credit: its package name, except Kyogijo Stadiums, Dougu Sports and Taisen Brackets, which are product names. */
const LIB_NAME: Partial<Record<Lib, string>> = { "kyogijo-stadiums": "Kyogijo Stadiums", "dougu-sports": "Dougu Sports", "taisen-brackets": "Taisen Brackets", "senshu-jerseys": "Senshu Jerseys" };

/** One library as "name (npm · GitHub)". The link labels are the names of those sites, so they are the same in every language. */
export function LibCredit({ lib }: { lib: Lib }) {
  return <>{LIB_NAME[lib] ?? lib} ({link(npmUrl(lib), "npm")} · {link(githubUrl(lib), "GitHub")})</>;
}

/** What a page can credit: the map (Chizu and Natural Earth), the flags (Hata and Wikimedia Commons), the formatted addresses (address-plus), the playing surfaces (Kyogijo Stadiums), the trophy and medal icons (Dougu Sports), the bracket layout (Taisen Brackets), the team logos that come from SportsLogos.Net. */
export type CreditKind = "maps" | "flags" | "addresses" | "surfaces" | "emblems" | "brackets" | "logos" | "jerseys" | "wikipedia";

/** The credit sentences for `use`, side by side, in the reader's language. Put it in a `<p className="note">`. */
export function Credits({ say, use }: { say: Speaker["say"]; use: readonly CreditKind[] }) {
  const sentence: Record<CreditKind, ReactNode> = {
    maps: <Rich text={say("credit.maps")} parts={{ chizu: <LibCredit lib="chizu" />, naturalEarth: link(NATURAL_EARTH_URL, "Natural Earth") }} />,
    flags: <Rich text={say("credit.flags")} parts={{ hata: <LibCredit lib="hata" />, commons: link(COMMONS_URL, "Wikimedia Commons") }} />,
    addresses: <Rich text={say("address.credit")} parts={{ link: <LibCredit lib="address-plus" /> }} />,
    surfaces: <Rich text={say("credit.surfaces")} parts={{ kyogijo: <LibCredit lib="kyogijo-stadiums" /> }} />,
    emblems: <Rich text={say("credit.emblems")} parts={{ dougu: <LibCredit lib="dougu-sports" /> }} />,
    brackets: <Rich text={say("credit.brackets")} parts={{ taisen: <LibCredit lib="taisen-brackets" /> }} />,
    jerseys: <Rich text={say("credit.jerseys")} parts={{ senshu: <LibCredit lib="senshu-jerseys" /> }} />,
    wikipedia: <Rich text={say("credit.wikipedia")} parts={{ reuse: link(WIKIPEDIA_REUSE_URL, say("credit.wikipediaLink")), licence: link(CC_BY_SA_URL, "CC BY-SA 4.0") }} />,
    logos: <Rich text={say("credit.logos")} parts={{ sportslogos: link(SPORTSLOGOS_URL, "SportsLogos.Net"), link: <Link href="/logos">{say("credit.logosLink")}</Link> }} />,
  };
  return (
    <>
      {use.map((k, i) => <Fragment key={k}>{i ? " " : null}{sentence[k]}</Fragment>)}
    </>
  );
}
