import { Heatmap, type HeatSeason } from "@/components/Heatmap";
import { HomeCards } from "@/components/HomeCards";
import { lineOf, type HomeCardLine, type HomeFamilyCard } from "@/lib/homeCards";
import { Figures } from "@/components/ui";
import { SOCIAL_IMAGES } from "@/lib/brandAssets";
import { withCoverage } from "@/lib/coverage";
import { getSummary } from "@/lib/data";
import { FAMILIES, familyHref, memberHref, memberName, menuEntries } from "@/lib/leagueFamilies";
import { playerTotal } from "@/lib/playerIndex";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LEAGUES, leagueInfo } from "@/lib/leagues";
import { LOCALE_OG } from "@/lib/locale";
import { guard } from "@/lib/loadGuard";
import { getMlsSeasons } from "@/lib/mls";
import { getTournaments } from "@/lib/soccer";
import { SOCCER_PATH } from "@/lib/soccerPath";

export const revalidate = 86400;

export async function generateMetadata() {
  const { say, locale } = await currentSpeaker();
  return {
    alternates: { canonical: "/" },
    openGraph: {
      title: "SPXN · SPX Network", url: "/", siteName: "SPXN", type: "website", locale: LOCALE_OG[locale],
      description: say("site.description"), images: [...SOCIAL_IMAGES.openGraph],
    },
  };
}

const tint = (code: string) => (code === "soccer" || code === "mls" ? "var(--soccer)" : `var(--${code})`);

function asHeat(list: { league: string; year: number; label: string; games: number; finals: number; share: number; champion: string | null }[]): HeatSeason[] {
  return list.map((x) => ({ league: x.league, year: x.year, label: x.label, games: x.games, finals: x.finals, share: x.share, champion: x.champion }));
}

export default guard(async function Home() {
  const { say } = await currentSpeaker();
  const [s, players, cups, mls] = await Promise.all([
    getSummary(),
    playerTotal(),
    getTournaments().catch(() => []),
    getMlsSeasons().catch(() => []),
  ]);
  const seasons = withCoverage(s.seasons);
  const t = s.totals;
  const soccerWord = say("nav.soccer");

  const cupByYear = new Map<number, HeatSeason>();
  for (const cup of cups) {
    const prev = cupByYear.get(cup.year);
    const games = (prev?.games ?? 0) + cup.matches;
    cupByYear.set(cup.year, {
      league: "soccer", year: cup.year, label: String(cup.year), games, finals: games, share: games ? 1 : 0,
      champion: cup.winner ?? prev?.champion ?? null,
    });
  }
  const soccerHeat: HeatSeason[] = [...cupByYear.values()];
  for (const row of mls) {
    const games = row.regular_matches + row.playoff_matches;
    soccerHeat.push({
      league: "mls", year: row.year, label: String(row.year), games,
      finals: row.complete ? games : row.regular_matches, share: games ? (row.complete ? 1 : row.regular_matches / games) : 0,
      champion: row.champion,
    });
  }
  const heatSeasons = [...asHeat(seasons), ...soccerHeat];

  const linesFor = (code: string) => {
    if (code === "soccer") return soccerHeat.filter((x) => x.league === "soccer");
    if (code === "mls") return soccerHeat.filter((x) => x.league === "mls");
    return seasons.filter((x) => x.league === code);
  };
  const card = (code: string): HomeCardLine => {
    const info = leagueInfo(code);
    const name = code === "soccer" ? say("soccer.homeName") : code === "mls" ? "MLS" : (info?.name ?? memberName(code, say("nav.international")));
    const short = code === "soccer" ? soccerWord : (info?.short ?? code.toUpperCase());
    const href = code === "soccer" ? SOCCER_PATH : memberHref(code);
    return lineOf(code, name, short, tint(code), linesFor(code), href);
  };

  const familyCards: HomeFamilyCard[] = FAMILIES.flatMap((f) => {
    const members = f.members.filter((m) => linesFor(m).some((x) => x.games > 0 || x.champion));
    if (!members.length) return [];
    const face = card(f.primary);
    const all = members.flatMap((m) => linesFor(m));
    const played = all.filter((x) => x.games > 0).sort((a, b) => a.year - b.year);
    return [{
      ...face,
      family: f.id,
      plus: f.plus,
      href: familyHref(f),
      from: played[0]?.year ?? face.from,
      to: played.at(-1)?.year ?? face.to,
      seasons: played.length,
      kids: f.members.filter((m) => m !== f.primary).map(card).filter((k) => k.seasons > 0 || k.championTeam),
    }];
  });

  const menuCards: HomeCardLine[] = [
    ...LEAGUES.map((l) => card(l.code)),
    ...(cups.length ? [card("soccer")] : []),
  ];

  return (
    <>
      <section className="head fade">
        <span className="eyebrow">{menuEntries(say("nav.soccer")).map((m) => m.label).join(" · ")}</span>
        <h1>{say("home.title")}</h1>
        <p className="lede">{say("home.lede")}</p>
      </section>
      <Figures items={[
        [say("home.games"), t.games], [say("home.results"), t.finals], [say("home.confirmed"), t.confirmed],
        [say("home.lines"), t.lines], [say("home.winners"), t.award_winners], [say("home.franchises"), t.franchises],
        ...(players ? [[say("home.players"), players] as [string, number]] : []),
      ]} />
      <section className="section">
        <h2>{say("home.archiveTitle")}</h2>
        <p className="note">{say("home.archiveNote")}</p>
        <p className="note">{say("home.archiveChips")}</p>
        <Heatmap seasons={heatSeasons} />
      </section>
      <HomeCards families={familyCards} menu={menuCards} />
    </>
  );
});
