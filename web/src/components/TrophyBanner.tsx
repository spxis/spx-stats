import type { ReactNode } from "react";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { TROPHY_NAME, trophySvg } from "@/lib/trophies";

/**
 * A league's trophy drawn large beside a champion, with the trophy's name: the banner of a won season and the showcase on a league's home page.
 * The drawing is the same precomputed markup the team pages use (lib/trophies.ts), drawn on the server. Only the five leagues have one here.
 * The children are the banner's own cells (`.cup`, `.badge`, `.who`, `.how`).
 */
export async function TrophyBanner({ lg, children }: { lg: string; children: ReactNode }) {
  const name = lg in TROPHY_NAME ? TROPHY_NAME[lg as keyof typeof TROPHY_NAME] : null;
  if (!name) return <section className="banner">{children}</section>;
  const { say } = await currentSpeaker();
  return (
    <section className="banner withcup">
      <figure className="bigcup" title={say(name)}>
        <span className="bigart" role="img" aria-label={say(name)} dangerouslySetInnerHTML={{ __html: trophySvg(lg) }} />
        <figcaption>{say(name)}</figcaption>
      </figure>
      <div className="bbody">{children}</div>
    </section>
  );
}
