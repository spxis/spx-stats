import Link from "next/link";
import { Fragment } from "react";
import type { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { roundSay } from "@/lib/roundWords";
import type { Say } from "@/lib/seriesCopy";
import { logoFor } from "@/lib/brand";
import { drawKnockout, knockoutLook } from "@/lib/bracketDraw";
import type { Bracket } from "@/lib/bracketLayout";
import { loadPlayoffs } from "@/lib/playoffs";
import { seasonPath, type TeamPaths } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";
import { roundPath, seriesPath, type Series } from "@/lib/series";
import { trophySvg } from "@/lib/trophies";
import { Credits } from "./Credits";
import { Knockout } from "./Knockout";
import { TeamLogo } from "./TeamLogo";
import { queryHref } from "./ViewTabs";
import "./alignment.css";
import "./series.css";
import { guard } from "@/lib/loadGuard";

/** One series as a card: both teams, the winner in bold, the score; the card opens the series page. */
export function SeriesCard({ paths, lg, s, brands, year, say }: { paths: TeamPaths; lg: string; s: Series; brands: Awaited<ReturnType<typeof getBrands>>; year: number; say: Say }) {
  const single = s.games.length === 1 && s.games[0].score[0] != null;
  const goals = s.basis === "goals";
  const num = (i: 0 | 1) => (single ? s.games[0].score[i] : goals ? s.sides[i].scored : s.sides[i].wins);
  return (
    <Link href={seriesPath(paths, lg, year, s)} prefetch={false} className="sercard" title={say("card.title", { a: s.sides[0].name, b: s.sides[1].name })}>
      {([0, 1] as const).map((i) => (
        <span key={i} className={`serrow${s.winner === i ? " won" : ""}`}>
          <TeamLogo url={logoFor(brands, s.sides[i].f, year)} size={18} />
          <span className="nm">{s.sides[i].name}</span>
          <b>{num(i)}</b>
        </span>
      ))}
      <span className="sermeta">{goals ? say("card.totalScore") : single ? say("card.oneGame") : say("card.games", { count: s.games.filter((g) => g.played).length })}{s.live ? say("card.live") : s.winner == null ? say("card.notSettled") : ""}</span>
    </Link>
  );
}

/** The playoff bracket of a season: one half down each side (the conferences where the alignment data splits them), the final in the middle. Draws nothing when there are no playoff games. */
export const SeasonPlayoffs = guard(async function SeasonPlayoffs({ lg, year, conf, div, sp: query }: { lg: string; year: number; conf: string; div: string; sp: Record<string, string | string[] | undefined> }) {
  const sp = await currentSpeaker();
  const say = roundSay(sp);
  const [{ series, names, bracket, layoutOf, align, playIn }, paths] = await Promise.all([loadPlayoffs(lg, year, say), getPaths()]);
  if (!series.length) return null;
  const b: Bracket = bracket;
  const slug = (label: string | null) => (label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const choices = b.sides.length === 2 && b.sides.every((s) => s.label) ? b.sides.map((s) => ({ key: slug(s.label), label: s.label! })) : [];
  // (the CFL's halves were once "east" and "west": an address with those still finds them in "east-division" and "west-division")
  const only = choices.find((c) => c.key === conf || c.key.replace(/-division$/, "") === conf)?.key ?? "";
  // One conference chosen: its half alone, as a bracket of its own (the series of that half, up to its final), with no champion.
  const half = only ? b.sides.find((s) => slug(s.label) === only) : undefined;
  const keep = half ? half.boxes.map((x) => x.i) : null;
  // Divisions the season had (two or more), within the chosen conference if one is chosen; picking one dims the series that have no club of it.
  const divMap = new Map<string, { label: string; conference: string; short: string | null; ids: Set<number> }>();
  // (a season with divisions and no conferences already shows its divisions as the halves above)
  const halvesAreDivisions = !align.some((a) => a.conference);
  for (const a of halvesAreDivisions ? [] : align) {
    if (!a.division || (only && slug(a.conference) !== only)) continue;
    const key = `${a.conference ?? ""}|${a.division}`;
    const d = divMap.get(key) ?? { label: a.division_short ?? a.division, conference: a.conference ?? "", short: a.conference_short, ids: new Set<number>() };
    d.ids.add(a.franchise_id);
    divMap.set(key, d);
  }
  const labelCount = new Map<string, number>();
  for (const d of divMap.values()) labelCount.set(d.label, (labelCount.get(d.label) ?? 0) + 1);
  const divChoices = divMap.size >= 2
    ? [...divMap.values()].sort((x, y) => x.conference.localeCompare(y.conference) || x.label.localeCompare(y.label)).map((d) => {
      const label = (labelCount.get(d.label) ?? 0) > 1 && d.short ? `${d.short} ${d.label}` : d.label;
      return { key: slug(label), label, ids: d.ids };
    })
    : [];
  const chosen = divChoices.find((c) => c.key === div);
  const dims = (s: Series) => !!chosen && !s.sides.some((t) => chosen.ids.has(t.f));
  // A division fades the ties with no club of it (class `ko-dim`, knockout.css); the final is always shown in full.
  const finalSeries = b.finalIndex != null ? series[b.finalIndex] : null;
  const shownLayout = keep ? layoutOf(keep) : b;
  const tieAt = (k: number) => series[keep ? keep[k] : k];
  const lastRound = Math.max(0, ...(keep ?? []).map((i) => b.ties[i].round));
  const art = drawKnockout(shownLayout, {
    locale: sp.locale, roundNames: keep ? names.slice(0, lastRound) : names,
    href: (t) => seriesPath(paths, lg, year, tieAt(t.index)),
    tieClass: (t) => (dims(tieAt(t.index)) && tieAt(t.index) !== finalSeries ? "ko-dim" : null),
    ...(keep ? { champion: false } : { trophy: trophySvg(lg) }),
    ...knockoutLook(lg),
  });
  // The NBA's play-in (2020-21 on), under the bracket it leads to: drawn only where the games fit the known shape (lib/nbaPlayIn.ts).
  const playInLayout = await playIn();
  const playInArt = playInLayout
    ? drawKnockout(playInLayout.layout, { locale: sp.locale, layout: "playin", seeds: true })
    : null;
  return (
    <section className="section" id="playoffs">
      <h2>{say("bracket.title")}</h2>
      <p className="note">{sp.say("playoffs.note", { count: sp.fmt(series.length) })}</p>
      {b.robin.length ? <p className="note"><Link href={roundPath(lg, year, 0)} prefetch={false}>{sp.say("playoffs.robinLink", { count: sp.fmt(b.robin.length) })}</Link></p> : null}
      {choices.length ? (
        <nav className="seg views" aria-label={sp.say("playoffs.sideAria")}>
          {[{ key: "", label: sp.say("playoffs.sideAll") }, ...choices].map((c) => (
            <Link key={c.key} href={`${queryHref(seasonPath(lg, year), query, { conf: c.key || null, div: null })}#playoffs`} prefetch={false} aria-current={c.key === only ? "page" : undefined}>{c.label}</Link>
          ))}
        </nav>
      ) : null}
      {divChoices.length ? (
        <nav className="seg views scroll" aria-label={sp.say("playoffs.divAria")}>
          {[{ key: "", label: sp.say("playoffs.divAll") }, ...divChoices].map((c) => (
            <Link key={c.key} href={`${queryHref(seasonPath(lg, year), query, { div: c.key || null })}#playoffs`} prefetch={false} aria-current={c.key === (chosen?.key ?? "") ? "page" : undefined}>{c.label}</Link>
          ))}
        </nav>
      ) : null}
      {chosen ? <p className="note">{sp.say("playoffs.divNote", { division: chosen.label })}</p> : null}
      <Knockout art={art} />
      {playInArt && !only ? (
        <>
          <h3>{sp.say("playoffs.playIn")}</h3>
          <p className="note">{sp.say("playoffs.playInNote")}</p>
          <Knockout art={playInArt} />
        </>
      ) : null}
      <p className="note">
        {names.map((n, i) => (
          <Fragment key={n + i}>{i ? " · " : null}<Link href={roundPath(lg, year, i + 1)} prefetch={false} title={sp.say("playoffs.round.title", { round: n })}>{n}</Link></Fragment>
        ))}
      </p>
      <p className="note"><Credits say={sp.say} use={["brackets"]} /></p>
    </section>
  );
});
