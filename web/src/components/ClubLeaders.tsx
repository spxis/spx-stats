import Link from "@/components/Link";
import { SortTable } from "@/components/SortTable";
import { Badge } from "@/components/ui";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { getPlayerPaths } from "@/lib/playerLinks";
import { tableOf } from "@/lib/sort";
import { getClubLeaders } from "@/lib/clubLeaders";
import { articleUrl, figureValue, LEADER_COLUMNS, type LeaderLine } from "@/lib/clubLeaderRows";

/**
 * The club leaders of a CFL club season, from the club-season article on English Wikipedia: passing, rushing and receiving tables (the BC Lions' 1958-81 articles
 * have one table of offensive leaders), each in the article's order. A name is a link only where the archive is certain which player it is; nothing otherwise.
 * Draws nothing for another league, while the data is not loaded and while the view is missing.
 */
export async function ClubLeaders({ lg, teamSeasonId, season }: { lg: string; teamSeasonId: number; season: string }) {
  const data = await getClubLeaders(lg, teamSeasonId);
  if (!data) return null;
  const [{ say }, paths] = await Promise.all([currentSpeaker(), getPlayerPaths()]);
  return (
    <section className="section" id="leaders">
      <h2>{say("cflLeaders.title")}</h2>
      {data.tables.map((t) => {
        const specs = LEADER_COLUMNS[t.category].filter((c) => t.keys.includes(c.key));
        const table = tableOf(t.lines, [
          {
            key: "player", label: say("roster.player"), get: (l: LeaderLine) => l.name,
            cell: (l: LeaderLine) => (l.id != null ? <Link href={paths(l.id, l.name, lg)} prefetch={false}>{l.name}</Link> : l.name),
          },
          ...specs.map((c) => ({
            key: c.key, label: say(c.label as PhraseKey), title: say(c.title as PhraseKey), num: true,
            get: (l: LeaderLine) => figureValue(l.stats[c.key]), cell: (l: LeaderLine) => l.stats[c.key] ?? "",
          })),
        ], (l, i) => `${t.category}|${i}`);
        return (
          <div key={t.category} className="section">
            <h3>{say(`cflLeaders.${t.category}` as PhraseKey)}</h3>
            {t.category === "offence" ? <p className="note">{say("cflLeaders.offenceNote")}</p> : null}
            <div className="tablebox"><SortTable {...table} param={`sort_leaders_${t.category}`} def={null} /></div>
          </div>
        );
      })}
      <p className="note">
        {say("cflLeaders.note", { season })}
        {data.article ? <>{" "}<a href={articleUrl(data.article.title)} rel="noopener noreferrer">{say("cflLeaders.article", { title: data.article.title })}</a></> : null}{" "}
        <Badge src="wikipedia" />
      </p>
    </section>
  );
}
