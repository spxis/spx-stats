import Link from "next/link";
import type { getBrands } from "@/lib/data";
import { logoFor } from "@/lib/brand";
import type { ChampionBox } from "@/lib/champions";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { TeamPaths } from "@/lib/slug";
import { TeamLogo } from "./TeamLogo";
import "./champions.css";

/** The latest champions, the club with the most titles and the latest repeat champion, as a row of boxes above the champions table. */
export async function ChampionRow({ lg, boxes, brands, paths, withGames }: { lg: string; boxes: ChampionBox[]; brands: Awaited<ReturnType<typeof getBrands>>; paths: TeamPaths; withGames: Set<number> }) {
  if (!boxes.length) return null;
  const { say, plural } = await currentSpeaker();
  return (
    <ul className="chrow" aria-label={say("champs.aria")}>
      {boxes.map((b) => {
        const kicker = b.kind === "recent" ? say("champs.recent", { season: b.label }) : b.kind === "most" ? say("champs.most") : say("champs.repeat");
        const detail = b.kind === "most" ? plural("count.championships", b.n) : b.kind === "repeat"
          ? (b.n === 2 ? say("champs.repeatTwo", { from: b.from ?? "", to: b.label }) : say("champs.repeatRun", { n: b.n, from: b.from ?? "", to: b.label })) : "";
        const href = b.kind === "recent" && withGames.has(b.year) ? paths.teamSeason(lg, b.f, b.year) : paths.team(lg, b.f);
        return (
          <li key={b.kind + b.year} className={`chbox ${b.kind}`}>
            <Link href={href} prefetch={false}>
              <span className="chkick">{kicker}</span>
              <span className="chlogo"><TeamLogo url={logoFor(brands, b.f, b.year)} size={64} /></span>
              <span className="chname">{b.name}</span>
              {detail ? <span className="chdetail">{detail}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
