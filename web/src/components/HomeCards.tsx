"use client";

import Link from "@/components/Link";
import { type HomeCardLine, type HomeFamilyCard } from "@/lib/homeCards";
import { useArchiveGrow } from "./archiveGrow";
import { useSpeaker } from "./i18n/LocaleProvider";

export type { HomeCardLine, HomeFamilyCard };

/** Home league cards: condensed families with a disclosure, or the menu leagues when Grow is on. */
export function HomeCards({ families, menu }: { families: HomeFamilyCard[]; menu: HomeCardLine[] }) {
  const { grown } = useArchiveGrow();
  const { say, plural } = useSpeaker();
  const cards = grown ? menu : families;
  return (
    <section className="cards">
      {cards.map((c) => {
        const fam = !grown && "kids" in c ? (c as HomeFamilyCard) : null;
        const title = fam?.plus ? `${c.short}+` : c.short;
        const href = c.href;
        const span = c.seasons
          ? say("home.span", { from: c.from ?? "", to: c.to ?? "", seasons: plural("count.seasons", c.seasons) })
          : say("home.noGames");
        const body = (
          <>
            <h3>{title}</h3>
            <span>{c.name}</span>
            <span className="span">{span}</span>
            {c.championSeason && c.championTeam ? <span className="note">{say("home.champion", { season: c.championSeason, team: c.championTeam })}</span> : null}
          </>
        );
        if (fam?.kids.length) {
          return (
            <article key={c.code} className="card familycard" style={{ "--lg": c.color } as React.CSSProperties}>
              <Link href={href}>{body}</Link>
              <details>
                <summary>{say("home.familyMore")}</summary>
                {fam.kids.map((k) => (
                  <Link key={k.code} className="card kid" href={k.href} style={{ "--lg": k.color } as React.CSSProperties}>
                    <h3>{k.short}</h3>
                    <span>{k.name}</span>
                    <span className="span">{k.seasons
                      ? say("home.span", { from: k.from ?? "", to: k.to ?? "", seasons: plural("count.seasons", k.seasons) })
                      : say("home.noGames")}</span>
                    {k.championSeason && k.championTeam ? <span className="note">{say("home.champion", { season: k.championSeason, team: k.championTeam })}</span> : null}
                  </Link>
                ))}
              </details>
            </article>
          );
        }
        return (
          <Link key={c.code} className="card" href={href} style={{ "--lg": c.color } as React.CSSProperties}>
            {body}
          </Link>
        );
      })}
    </section>
  );
}
