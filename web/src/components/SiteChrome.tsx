import Link from "next/link";
import { LeagueNav } from "./LeagueNav";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="top">
      <Link className="brand" href="/">
        <span className="brand-mark">SPXN</span>
        <span className="brand-name">SPX Stats Network</span>
      </Link>
      <LeagueNav />
      <nav className="aux" aria-label="About the data">
        <Link href="/sources">Sources</Link>
        <Link href="/quality">Data quality</Link>
        <Link href="/logos">Logos</Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <p>Games and lines from 2002 to 2013 are SPX&apos;s own (SportsInteractive.com, 1997–2013). Other seasons come from open sources, each named beside its data.</p>
      <p className="retro">
        The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may
        contact Retrosheet at <a href="https://www.retrosheet.org">www.retrosheet.org</a>.
      </p>
      <p>
        NFL data from <a href="https://github.com/nflverse">nflverse</a> (CC BY 4.0). NHL results and standings outside SPX&apos;s
        seasons from the NHL. Award names and winners from <a href="https://www.wikidata.org">Wikidata</a> (CC0).
      </p>
      <p>
        Team logos are trademarks of their owners, shown only to identify each team; SPXN is not affiliated with any team or
        league. <Link href="/logos">About the logos</Link>.
      </p>
    </footer>
  );
}
