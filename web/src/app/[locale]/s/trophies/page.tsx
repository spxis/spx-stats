import type { Metadata } from "next";
import Link from "@/components/Link";
import { TrophyBoards, TrophyCards, orderTrophies } from "@/components/TrophyBlocks";
import { TrophySprite } from "@/components/TrophySprite";
import { trophiesPath, type TrophyRow } from "@/lib/awardTrophy";
import { trophyArt } from "@/lib/cups";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { ALL_LEAGUES } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getAllTrophyRows, getTrophyList } from "@/lib/trophyData";

// A kept page, drawn once for everyone: every league's trophies, then who won the most across all of them. It reads no query (lib/routing.ts: ALWAYS_STATIC).
export const revalidate = 86400;

async function data() {
  const [infos, byLeague] = await Promise.all([getTrophyList(), getAllTrophyRows()]);
  const leagues = ALL_LEAGUES.filter((l) => infos.some((t) => t.league === l.code));
  return { infos, byLeague, leagues };
}

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, plural, locale } = await currentSpeaker();
  const { infos, byLeague, leagues } = await data();
  const winners = [...byLeague.values()].reduce((n, r) => n + r.length, 0);
  return pageMeta({
    title: say("trophies.title"),
    description: say("trophies.metaDesc", { trophies: plural("count.trophies", infos.length), winners: plural("count.winners", winners), leagues: String(leagues.length) }),
    path: trophiesPath(), locale,
  });
});

export default guard(async function TrophiesPage() {
  const { say, plural } = await currentSpeaker();
  const { infos, byLeague, leagues } = await data();
  const all: TrophyRow[] = [...byLeague.values()].flat();
  const arts = infos.map((t) => trophyArt(t.code, t.kind));
  return (
    <>
      <section className="head fade">
        <h1>{say("trophies.title")}</h1>
        <p className="lede">{say("trophies.lede", { trophies: plural("count.trophies", infos.length), winners: plural("count.winners", all.length) })}</p>
        <nav className="quicklinks" aria-label={say("trophies.byLeague")}>
          {leagues.map((l) => <Link key={l.code} href={trophiesPath(l.code)}>{l.short}</Link>)}
        </nav>
      </section>
      <TrophySprite arts={arts} />
      <TrophyBoards rows={all} />
      {leagues.map((l) => {
        const mine = orderTrophies(infos.filter((t) => t.league === l.code));
        return (
          <section key={l.code} className="section leaguegroup" aria-labelledby={`lg-${l.code}`}>
            <h2 id={`lg-${l.code}`}><Link href={trophiesPath(l.code)}>{say("trophies.leagueTitle", { league: l.short })}</Link></h2>
            <TrophyCards infos={mine} rows={byLeague.get(l.code) ?? []} sprite={false} />
          </section>
        );
      })}
    </>
  );
});
