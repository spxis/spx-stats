import Link from "next/link";
import { Rich } from "./i18n/Rich";
import { LanguagePicker } from "./i18n/LanguagePicker";
import { LeagueNav } from "./LeagueNav";
import { ThemeToggle } from "./ThemeToggle";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

export async function SiteHeader() {
  const { say } = await currentSpeaker();
  return (
    <header className="top">
      <Link className="brand" href="/">
        <span className="brand-mark">SPXN</span>
        <span className="brand-name">SPX Stats Network</span>
      </Link>
      <LeagueNav />
      <nav className="aux" aria-label={say("nav.about")}>
        <Link href="/sources">{say("nav.sources")}</Link>
        <Link href="/quality">{say("nav.quality")}</Link>
        <Link href="/logos">{say("nav.logos")}</Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const { say } = await currentSpeaker();
  return (
    <footer className="foot">
      <p>{say("footer.archive")}</p>
      <p className="retro">
        <Rich text={say("footer.retro")} parts={{ link: <a href="https://www.retrosheet.org">www.retrosheet.org</a> }} />
      </p>
      <p>
        <Rich text={say("footer.sources")} parts={{
          nflverse: <a href="https://github.com/nflverse">nflverse</a>,
          wikidata: <a href="https://www.wikidata.org">Wikidata</a>,
        }} />
      </p>
      <p>
        <Rich text={say("footer.logos")} parts={{ link: <Link href="/logos">{say("footer.aboutLogos")}</Link> }} />
      </p>
      <LanguagePicker />
    </footer>
  );
}
