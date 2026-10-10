import Link from "next/link";
import { Heatmap } from "@/components/Heatmap";
import { Figures } from "@/components/ui";
import { withCoverage } from "@/lib/coverage";
import { getSummary } from "@/lib/data";
import { LEAGUES } from "@/lib/leagues";

export const revalidate = 3600;

export const metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "SPXN · SPX Stats Network", url: "/", siteName: "SPXN", type: "website", locale: "en_CA",
    description: "Scores, standings, champions and awards of the NHL, NBA, MLB, NFL and CFL, from the SPX archive and open sources.",
  },
};

export default async function Home() {
  const s = await getSummary();
  const seasons = withCoverage(s.seasons);
  const t = s.totals;
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">NHL · NBA · MLB · NFL · CFL</span>
        <h1>Every game, every champion</h1>
        <p className="lede">
          Scores, standings, champions and awards of five leagues, built from the SPX archive of 1997–2013 and filled out from open
          sources. Every result says where it came from.
        </p>
      </section>
      <Figures items={[
        ["Games", t.games], ["Results", t.finals], ["Confirmed by a second source", t.confirmed],
        ["Betting lines", t.lines], ["Award winners", t.award_winners], ["Franchises", t.franchises],
      ]} />
      <section className="section">
        <h2>What the archive holds</h2>
        <p className="note">Each square is a season, shaded by how many of its games have a result. Click one to open it.</p>
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
              <span className="span">{list.length ? `${list[0].year}–${list.at(-1)!.year} · ${list.length} seasons` : "No games yet"}</span>
              {last ? <span className="note">{`${last.label} champion: ${last.champion}`}</span> : null}
            </Link>
          );
        })}
      </section>
    </>
  );
}
