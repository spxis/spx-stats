import type { Metadata } from "next";
import Link from "@/components/Link";
import { FamilyNav } from "@/components/FamilyNav";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { Figures } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getEuropeTops } from "@/lib/europe";
import { europeLeaguePath, seasonLabel } from "@/lib/europePath";
import { getMlsSeasons } from "@/lib/mls";
import { getTournaments, type Tournament } from "@/lib/soccer";
import { MLS_PATH } from "@/lib/mlsPath";
import { tournamentPath, WORLDCUP_PATH, WORLDCUP_TEAMS_PATH } from "@/lib/soccerPath";
import "@/components/soccer.css";

export const revalidate = 86400;

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("soccer.title"), description: say("soccer.metaDesc"), path: "/soccer", locale });
});

/** The soccer landing page: the World Cup is the first competition. With no soccer data published yet it says so and links nowhere that would be empty. */
export default guard(async function SoccerPage() {
  const { say, plural } = await currentSpeaker();
  const [all, mls, europe] = await Promise.all([getTournaments(), getMlsSeasons().catch(() => []), getEuropeTops()]);
  const lastCup = mls.filter((s) => s.champion).at(-1);
  const men = all.filter((t) => t.league === "wc");
  const women = all.filter((t) => t.league === "wwc");
  const goals = all.reduce((n, t) => n + t.goals, 0);
  const matches = all.reduce((n, t) => n + t.matches, 0);
  const card = (list: Tournament[], title: string, tint: string) => {
    const last = list.filter((t) => t.winner).at(-1);
    return (
      <Link className="card" href={WORLDCUP_PATH} style={{ "--lg": tint } as React.CSSProperties}>
        <h3>{title}</h3>
        <span className="span">{say("soccer.span", { from: list[0].year, to: list.at(-1)!.year, tournaments: plural("count.tournaments", list.length) })}</span>
        {last ? <span className="note">{say("soccer.latest", { year: last.year, champion: last.winner ?? "" })}</span> : null}
      </Link>
    );
  };
  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow">{say("nav.soccer")}</span>
        <h1>{say("soccer.title")}</h1>
        <p className="lede">{say("soccer.lede")}</p>
        <FamilyNav family="soccer" />
      </section>
      {mls.length || europe.length ? (
        <section className="section">
          <h2>{say("soccer.leagues")}</h2>
          <div className="cards">
            {europe.map((e) => (
              <Link key={e.code} className="card" href={europeLeaguePath(e.code)} style={{ "--lg": "var(--soccer)" } as React.CSSProperties}>
                <h3>{e.name}</h3>
                <span className="span">{say("europe.card.span", { from: seasonLabel(e.first), to: seasonLabel(e.last), seasons: plural("count.seasons", e.seasons) })}</span>
                {e.champion && e.championYear != null ? <span className="note">{say("europe.card.latest", { champion: e.champion })}</span> : null}
              </Link>
            ))}
            {mls.length ? <Link className="card" href={MLS_PATH} style={{ "--lg": "var(--soccer)" } as React.CSSProperties}>
              <h3>{say("mls.title")}</h3>
              <span className="span">{say("soccer.span", { from: mls[0].year, to: mls.at(-1)!.year, tournaments: plural("count.seasons", mls.length) })}</span>
              {lastCup ? <span className="note">{say("soccer.latest", { year: lastCup.year, champion: lastCup.champion ?? "" })}</span> : null}
            </Link> : null}
          </div>
        </section>
      ) : null}
      {all.length ? (
        <>
          <Figures items={[
            [say("soccer.tournaments"), all.length], [say("soccer.matches"), matches], [say("soccer.goals"), goals],
          ]} />
          <section className="section">
            <h2>{say("soccer.competitions")}</h2>
            <div className="cards">
              {men.length ? card(men, say("wc.mens"), "var(--soccer)") : null}
              {women.length ? card(women, say("wc.womens"), "var(--soccer)") : null}
            </div>
            <p className="note"><Link href={WORLDCUP_PATH}>{say("soccer.allTournaments")}</Link> · <Link href={WORLDCUP_TEAMS_PATH}>{say("soccer.teamsLink")}</Link></p>
          </section>
          <section className="section">
            <h2>{say("soccer.recent")}</h2>
            <ul className="sc-list">
              {[...all].sort((a, b) => b.year - a.year).slice(0, 6).map((t) => (
                <li key={t.tournament_id}>
                  <Link href={tournamentPath(t.year)}>{say(t.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: t.year })}</Link>
                  {t.winner && t.winner_slug ? <> · {say("wc.champion")}: <SoccerTeamName slug={t.winner_slug} name={t.winner} flag={t.winner_flag} /></> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : mls.length || europe.length ? null : (
        <section className="section"><p className="note">{say("soccer.none")}</p></section>
      )}
      <section className="section"><SoccerCredit say={say} /></section>
    </div>
  );
});
