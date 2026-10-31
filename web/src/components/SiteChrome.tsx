import IntentLink from "@/components/IntentLink";
import Link from "@/components/Link";
import { FooterLanguage, FooterVersion, HeaderAccount } from "./auth/Account";
import { BrandImg } from "./BrandImg";
import { BrandSwoosh } from "./BrandSwoosh";
import { Rich } from "./i18n/Rich";
import { LeagueNav } from "./LeagueNav";
import { LinkList } from "./LinkList";
import { SoccerFooterLinks } from "./SoccerFooterLinks";
import { authEnabled } from "@/lib/auth/config";
import { latestDataVersion } from "@/lib/releases/client";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { menuEntries } from "@/lib/leagueFamilies";
import pkg from "../../package.json";

export async function SiteHeader() {
  const { say } = await currentSpeaker();
  return (
    <header className="top">
      <IntentLink className="brand" href="/">
        <BrandSwoosh height={26} />
        <span className="brand-mark">SPXN</span>
        <span className="brand-name">SPX Network</span>
      </IntentLink>
      <LeagueNav />
      <nav className="aux" aria-label={say("nav.about")}>
        <IntentLink href="/teams">{say("nav.teams")}</IntentLink>
        <IntentLink href="/players">{say("nav.players")}</IntentLink>
        <IntentLink href="/about">{say("nav.aboutPage")}</IntentLink>
        <HeaderAccount version={pkg.version} signIn={authEnabled()} />
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const [{ say }, dataVersion] = await Promise.all([currentSpeaker(), latestDataVersion()]);
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const menu = menuEntries(say("nav.soccer"));
  return (
    <footer className="foot">
      <div className="foot-cols">
        <nav className="foot-col" aria-label={say("footer.colLeagues")}>
          <b>{say("footer.colLeagues")}</b>
          <div className="foot-links">
            <LinkList links={menu.filter((m) => m.id !== "soccer").map((m) => [m.href, m.label] as const)} />
            <SoccerFooterLinks />
          </div>
        </nav>
        <nav className="foot-col" aria-label={say("nav.allTime")}>
          <b>{say("nav.allTime")}</b>
          <div className="foot-links">
            <LinkList links={menu.flatMap((m) => (m.allTime ? [[`/${m.allTime}/all-time`, m.label] as const] : []))} />
          </div>
        </nav>
        <nav className="foot-col" aria-label={say("footer.colData")}>
          <b>{say("footer.colData")}</b>
          <div className="foot-links">
            <LinkList links={[["/about", say("nav.aboutPage")], ["/teams", say("nav.teams")], ["/players", say("nav.players")], ["/venues", say("nav.venues")], ["/countries", say("nav.countries")], ["/sources", say("nav.sources")], ["/quality", say("nav.quality")], ["/logos", say("nav.logos")]]} />
          </div>
        </nav>
        <nav className="foot-col" aria-label={say("footer.colLegal")}>
          <b>{say("footer.colLegal")}</b>
          <div className="foot-links">
            <LinkList links={[["/privacy", say("nav.privacy")], ["/terms", say("nav.terms")]]} />
          </div>
        </nav>
      </div>
      <p className="foot-unofficial" id="unofficial">
        {say("footer.unofficial")} <Link href="/logos#owners">{say("footer.unofficialLink")}</Link>
      </p>
      <div className="foot-fine">
        <p>{say("footer.archive")}</p>
        <p className="retro">
          <Rich text={say("footer.retro")} parts={{ link: <a href="https://www.retrosheet.org">www.retrosheet.org</a> }} />
        </p>
        <p>
          <Rich text={say("footer.credits")} parts={{ link: <Link href="/terms">{say("terms.title")}</Link> }} />
        </p>
      </div>
      <p className="foot-brand">
        <BrandImg name="sportsinteractive" height={22} alt="sportsinteractive" />
        <span><Rich text={say("footer.brand")} parts={{ link: <Link href="/about#marks">{say("footer.brandLink")}</Link> }} /></span>
      </p>
      <div className="foot-base">
        <FooterLanguage />
        <p className="ver">
          <FooterVersion text={say("footer.version", { version: sha ? `${pkg.version} (${sha})` : pkg.version })} />
          {dataVersion ? ` · Data ${dataVersion}` : null}
        </p>
      </div>
    </footer>
  );
}
