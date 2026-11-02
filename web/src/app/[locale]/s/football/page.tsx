import Link from "@/components/Link";
import { AccentStyle } from "@/components/AccentStyle";
import { SportMark } from "@/components/SportMark";
import { getSummary } from "@/lib/data";
import { FOOTBALL_PATH } from "@/lib/leagueFamilies";
import { footballGroups, type FootballLeague } from "@/lib/football";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { leagueSat } from "@/lib/noSeason";

export const revalidate = 86400;

export const generateMetadata = guardMeta(async () => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("football.title"), description: say("football.metaDesc"), path: FOOTBALL_PATH, locale });
});

/**
 * Football, league by league: the NFL (with the AFL and the AAFC under it), college football and the CFL, each with its years, seasons and champions and a link to its own page.
 * A kept page that reads no query; only the leagues the archive holds are listed (lib/football.ts). Each league keeps its own records, never added to another's.
 */
export default guard(async function FootballPage() {
  const { say, plural } = await currentSpeaker();
  const { seasons } = await getSummary();
  // (a season the league did not play is no season held: the same count as the league's own page)
  const groups = footballGroups(seasons.filter((s) => !leagueSat(s)));
  const row = (l: FootballLeague) => (
    <>
      <Link href={`/${l.code}`}>{l.name === l.short ? l.name : `${l.name} (${l.short})`}</Link>
      {" · "}{l.first === l.last ? l.first : `${l.first}–${l.last}`}
      {" · "}{plural("count.seasons", l.seasons)}
      {" · "}{plural("count.champions", l.champions)}
    </>
  );
  return (
    <SportMark sport="nfl">
      <AccentStyle league="nfl" />
      <section className="head fade">
        <span className="eyebrow">{say("football.eyebrow")}</span>
        <h1>{say("football.title")}</h1>
        <p className="lede">{say("football.lede")}</p>
      </section>
      <section className="section">
        <h2>{say("football.leagues")}</h2>
        <ul className="otherleagues hockeyleagues">
          {groups.map((g) => (
            <li key={g.code}>
              {row(g)}
              {g.rivals.length ? (
                <>
                  <span className="note latest">{say("football.rivals", { league: g.short })}</span>
                  <ul className="otherleagues">
                    {g.rivals.map((r) => <li key={r.code}>{row(r)}</li>)}
                  </ul>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </SportMark>
  );
});
