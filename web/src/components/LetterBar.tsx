import Link from "@/components/Link";
import type { Speaker } from "@/lib/i18n/i18n";
import type { LetterBy } from "@/lib/listQuery";
import "./letterbar.css";

export const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/**
 * The A to Z row of the players list: one link for each letter that sets `?letter=` (pressing the chosen letter again clears it), so the choice is in the
 * address, shared and crawlable. The letter is the first of the last name, or of the first name with the toggle beside the row. `counts` are the players
 * per letter under the other filters (api.player_letters); a letter with none is greyed and not a link, and where the database cannot say (null) every
 * letter is a link. `href` makes the address with a change (the page keeps the league, country, years and search in it).
 */
export function LetterBar({ say, plural, letter, by, counts, href }: {
  say: Speaker["say"]; plural: Speaker["plural"];
  letter: string; by: LetterBy; counts: ReadonlyMap<string, number> | null;
  href: (changes: Record<string, string | null>) => string;
}) {
  return (
    <div className="azrow">
      <nav className="az" aria-label={say("players.azAria")}>
        <Link className="azall" href={href({ letter: null })} prefetch={false} aria-current={letter ? undefined : "true"}>{say("phase.all")}</Link>
        {LETTERS.map((L) => {
          const l = L.toLowerCase();
          const n = counts?.get(l);
          const chosen = l === letter;
          if (counts && !n && !chosen) return <span key={L} className="azoff" aria-disabled="true" title={say("players.azNone", { letter: L })}>{L}</span>;
          return (
            <Link key={L} href={href({ letter: chosen ? null : L })} prefetch={false} aria-current={chosen ? "true" : undefined}
              title={n ? `${L}: ${plural("count.players", n)}` : undefined}>{L}</Link>
          );
        })}
      </nav>
      <div className="seg views" role="group" aria-label={say("players.azByAria")}>
        {(["first", "last"] as const).map((b) => (
          <Link key={b} href={href({ letter_by: b === "last" ? null : b })} prefetch={false} aria-current={b === by ? "page" : undefined}>{say(b === "last" ? "players.azLast" : "players.azFirst")}</Link>
        ))}
      </div>
    </div>
  );
}
