import Link from "next/link";
import { Heatmap } from "@/components/Heatmap";
import { SoccerHomeCard } from "@/components/SoccerHomeCard";
import { Figures } from "@/components/ui";
import { withCoverage } from "@/lib/coverage";
import { getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUES } from "@/lib/leagues";
import { LOCALE_OG } from "@/lib/locale";
import { guard } from "@/lib/loadGuard";

export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return {
    alternates: { canonical: "/" },
    openGraph: {
      title: "SPXN · SPX Stats Network", url: "/", siteName: "SPXN", type: "website", locale: LOCALE_OG[locale],
      description: say("site.description"),
    },
  };
}

export default guard(async function Home() {
  const { say, plural } = await currentSpeaker();
  const s = await getSummary();
  const seasons = withCoverage(s.seasons);
  const t = s.totals;
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">NHL · NBA · MLB · NFL · CFL · {say("nav.soccer")}</span>
        <h1>{say("home.title")}</h1>
        <p className="lede">{say("home.lede")}</p>
      </section>
      <Figures items={[
        [say("home.games"), t.games], [say("home.results"), t.finals], [say("home.confirmed"), t.confirmed],
        [say("home.lines"), t.lines], [say("home.winners"), t.award_winners], [say("home.franchises"), t.franchises],
      ]} />
      <section className="section">
        <h2>{say("home.archiveTitle")}</h2>
        <p className="note">{say("home.archiveNote")}</p>
        <Heatmap
          leagues={LEAGUES.map((l) => l.code)}
          seasons={seasons.map((x) => ({ league: x.league, year: x.year, label: x.label, games: x.games, finals: x.finals, share: x.share, champion: x.champion }))}
        />
      </section>
      <section className="cards">
        {LEAGUES.map((l) => {
          const list = seasons.filter((x) => x.league === l.code && x.games > 0);
          const last = seasons.filter((x) => x.league === l.code && x.champion).at(-1);
          return (
            <Link key={l.code} className="card" href={`/${l.code}`} style={{ "--lg": `var(--${l.code})` } as React.CSSProperties}>
              <h3>{l.short}</h3>
              <span>{l.name}</span>
              <span className="span">{list.length ? say("home.span", { from: list[0].year, to: list.at(-1)!.year, seasons: plural("count.seasons", list.length) }) : say("home.noGames")}</span>
              {last ? <span className="note">{say("home.champion", { season: last.label, team: last.champion ?? "" })}</span> : null}
            </Link>
          );
        })}
        <SoccerHomeCard />
      </section>
    </>
  );
});
