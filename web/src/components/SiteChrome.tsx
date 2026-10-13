import Link from "next/link";
import { FooterLanguage, HeaderAccount } from "./auth/Account";
import { Rich } from "./i18n/Rich";
import { LeagueNav } from "./LeagueNav";
import { authEnabled } from "@/lib/auth/config";
import { latestDataVersion } from "@/lib/releases/client";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUES } from "@/lib/leagues";
import pkg from "../../package.json";

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
        <Link href="/teams">{say("nav.teams")}</Link>
        <Link href="/players">{say("nav.players")}</Link>
        <Link href="/about">{say("nav.aboutPage")}</Link>
        <HeaderAccount version={pkg.version} signIn={authEnabled()} />
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const [{ say }, dataVersion] = await Promise.all([currentSpeaker(), latestDataVersion()]);
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return (
    <footer className="foot">
      <div className="foot-cols">
        <nav className="foot-col" aria-label={say("footer.colLeagues")}>
          <b>{say("footer.colLeagues")}</b>
          <div className="foot-links">
            {LEAGUES.map((l) => <Link key={l.code} href={`/${l.code}`}>{l.short}</Link>)}
          </div>
        </nav>
        <nav className="foot-col" aria-label={say("nav.allTime")}>
          <b>{say("nav.allTime")}</b>
          <div className="foot-links">
            {LEAGUES.map((l) => <Link key={l.code} href={`/${l.code}/all-time`}>{l.short}</Link>)}
          </div>
        </nav>
        <nav className="foot-col" aria-label={say("footer.colData")}>
          <b>{say("footer.colData")}</b>
          <div className="foot-links">
            <Link href="/about">{say("nav.aboutPage")}</Link>
            <Link href="/teams">{say("nav.teams")}</Link>
            <Link href="/players">{say("nav.players")}</Link>
            <Link href="/venues">{say("nav.venues")}</Link>
            <Link href="/sources">{say("nav.sources")}</Link>
            <Link href="/quality">{say("nav.quality")}</Link>
            <Link href="/logos">{say("nav.logos")}</Link>
          </div>
        </nav>
        <nav className="foot-col" aria-label={say("footer.colLegal")}>
          <b>{say("footer.colLegal")}</b>
          <div className="foot-links">
            <Link href="/privacy">{say("nav.privacy")}</Link>
            <Link href="/terms">{say("nav.terms")}</Link>
          </div>
        </nav>
      </div>
      <div className="foot-fine">
        <p>{say("footer.archive")}</p>
        <p className="retro">
          <Rich text={say("footer.retro")} parts={{ link: <a href="https://www.retrosheet.org">www.retrosheet.org</a> }} />
        </p>
        <p>
          <Rich text={say("footer.credits")} parts={{ link: <Link href="/terms">{say("terms.title")}</Link> }} />
        </p>
      </div>
      <div className="foot-base">
        <FooterLanguage />
        <p className="ver">
          {say("footer.version", { version: sha ? `${pkg.version} (${sha})` : pkg.version })}
          {dataVersion ? ` · Data ${dataVersion}` : null}
        </p>
      </div>
    </footer>
  );
}
