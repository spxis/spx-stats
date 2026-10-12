import Link from "next/link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { leadersPath, UNIT_OF, type TeamStatId } from "@/lib/leaderStats";
import { LOCALE_TAG } from "@/lib/locale";
import type { TeamRanks as Ranks } from "@/lib/teamRanks";
import "./team.css";

const statKey = (id: TeamStatId, unit: string): PhraseKey =>
  (id === "pf" ? `leaders.team.for.${unit}` : id === "pa" ? `leaders.team.against.${unit}` : id === "diff" ? `leaders.team.diff.${unit}` : `leaders.team.${id}`) as PhraseKey;

/** A club's place in its division, conference and league and its rank in the team stats, each linking to that stat on the season's leaders page. */
export async function TeamRanks({ lg, year, ranks }: { lg: string; year: number; ranks: Ranks }) {
  const { say, plural, locale } = await currentSpeaker();
  const ordinal = new Intl.PluralRules(LOCALE_TAG[locale], { type: "ordinal" });
  const unit = UNIT_OF[lg] ?? "points";
  return (
    <div className="ranks">
      <ul aria-label={say("tseason.ranksAria")}>
        {ranks.items.map((r) => (
          <li key={r.what.kind === "stat" ? r.what.stat : r.what.kind}>
            <Link href={`${leadersPath(lg, year)}?stat=${r.link}`} prefetch={false}>
              {say("tseason.rankIn", {
                place: say(`rank.${ordinal.select(r.place)}` as PhraseKey, { n: r.place }),
                what: r.what.kind === "stat" ? say(statKey(r.what.stat, unit)) : r.what.name,
              })}
            </Link>
          </li>
        ))}
      </ul>
      {ranks.progress ? <p>{plural("tseason.rankThrough", ranks.gp)}</p> : null}
    </div>
  );
}
