import { RetiredBannerItem } from "@/components/RetiredBannerItem";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { RetiredNumber } from "@/lib/retiredNumbers";

/** The numbers clubs retired for this person, small, beside the birthplace map. Nothing when there are none. */
export async function PlayerRetired({ rows, team, href }: {
  rows: RetiredNumber[];
  team: (r: RetiredNumber) => string;
  href: (r: RetiredNumber) => string;
}) {
  if (!rows.length) return null;
  const { say } = await currentSpeaker();
  return (
    <ul className="pretired" aria-label={say("player.retired")}>
      {rows.map((r) => {
        const alt = say("player.retiredAlt", { number: String(r.jersey_number), team: team(r) });
        return (
          <RetiredBannerItem
            key={r.retired_number_id}
            src={`/jersey-banner/${r.franchise_id}/${r.retired_number_id}`}
            alt={alt}
            label={alt}
            cap={team(r)}
            href={href(r)}
            width={160}
            height={224}
          />
        );
      })}
    </ul>
  );
}
