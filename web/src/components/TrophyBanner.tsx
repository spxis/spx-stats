import type { ReactNode } from "react";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { trophyPhrase } from "@/lib/trophies";
import { bannerCupSvg } from "@/lib/cups";
import type { TurnLeague } from "@/lib/trophyTurn";
import { TurnTrophy } from "./TurnTrophy";

/**
 * A league's trophy drawn large beside a champion, with the trophy's name: the banner of a won season and the showcase on a league's home page.
 * The server draws the trophy in polished metal, leaning a little toward the eye (drawn by the dougu-sports package, lib/cups.ts), so the page reads
 * with no script. TurnTrophy then lets it turn slowly and be dragged (a few kB, loaded once it is in view). Only the five leagues have one here.
 * The children are the banner's own cells (`.cup`, `.badge`, `.who`, `.how`).
 */
export async function TrophyBanner({ lg, year, children }: { lg: string; year?: number; children: ReactNode }) {
  const name = trophyPhrase(lg, year);
  if (!name) return <section className="banner">{children}</section>;
  const { say } = await currentSpeaker();
  return (
    <section className="banner withcup">
      <figure className="bigcup" title={say(name)}>
        <span className="bigart" role="img" aria-label={say(name)} dangerouslySetInnerHTML={{ __html: bannerCupSvg(lg) }} />
        <TurnTrophy league={lg as TurnLeague} hint={say("trophy.turnHint")} />
        <figcaption>{say(name)}</figcaption>
      </figure>
      <div className="bbody">{children}</div>
    </section>
  );
}
