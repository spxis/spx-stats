import Link from "@/components/Link";
import { AccentStyle } from "@/components/AccentStyle";
import { SportMark } from "@/components/SportMark";
import { Rich } from "@/components/i18n/Rich";
import { TeamData } from "@/components/TeamData";
import { TeamLabel } from "@/components/TeamLabel";
import { logoFor } from "@/lib/brand";
import { getBrands, getSummary } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { leagueSat } from "@/lib/noSeason";
import { moreHockeyGroups } from "@/lib/moreHockey";
import { MORE_HOCKEY_PATH } from "@/lib/leagueFamilies";

export const revalidate = 86400;

export const generateMetadata = guardMeta(async () => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("hockey.more"), description: say("hockey.metaDesc"), path: MORE_HOCKEY_PATH, locale });
});

/**
 * Hockey beyond the NHL, league by league and level by level: the AHL and the ECHL now, then the leagues that follow them. A kept page that reads no query: only the leagues the
 * archive holds are listed (lib/moreHockey.ts), each with its years, seasons, champions and latest champion, and a link to its own page.
 */
export default guard(async function MoreHockeyPage() {
  const { say, plural } = await currentSpeaker();
  const [{ seasons }, brands] = await Promise.all([getSummary(), getBrands()]);
  // (a season the league did not play is no season held: the same count as the league's own page)
  const groups = moreHockeyGroups(seasons.filter((s) => !leagueSat(s)));
  return (
    <SportMark sport="nhl">
      <TeamData leagues={groups.flatMap((g) => g.leagues.map((l) => l.code))}>
      <AccentStyle league="nhl" />
      <section className="head fade">
        <span className="eyebrow">{say("hockey.eyebrow")}</span>
        <h1>{say("hockey.more")}</h1>
        <p className="lede">{say("hockey.lede")}</p>
      </section>
      {groups.map((g) => (
        <section className="section" key={g.level}>
          <h2>{say(`hockey.level.${g.level}`)}</h2>
          <p className="note">{say(`hockey.levelNote.${g.level}`)}</p>
          <ul className="otherleagues hockeyleagues">
            {g.leagues.map((l) => (
              <li key={l.code}>
                <Link href={`/${l.code}`}>{l.name === l.short ? l.name : `${l.name} (${l.short})`}</Link>
                {" · "}{l.first === l.last ? l.first : `${l.first}–${l.last}`}
                {" · "}{plural("count.seasons", l.seasons)}
                {" · "}{plural("count.champions", l.champions)}
                {l.latest ? (
                  <span className="note latest">
                    <Rich text={say("hockey.latestChampion")} parts={{ team: <TeamLabel lg={l.code} f={l.latest.franchise} name={l.latest.champion} logo={logoFor(brands, l.latest.franchise)} />, season: l.latest.label }} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="section">
        <p className="note">{say("hockey.nhlNote")} <Link href="/nhl">{say("hockey.nhlLink")}</Link></p>
      </section>
      </TeamData>
    </SportMark>
  );
});
