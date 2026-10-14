import Link from "next/link";
import type { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { roundSay } from "@/lib/roundWords";
import type { Say } from "@/lib/seriesCopy";
import { logoFor } from "@/lib/brand";
import type { Bracket } from "@/lib/bracketLayout";
import { loadPlayoffs } from "@/lib/playoffs";
import { seasonPath, type TeamPaths } from "@/lib/slug";
import { getPaths } from "@/lib/teamSlugs";
import { nickname, roundPath, scoreWords, seriesPath, type Series } from "@/lib/series";
import { BracketFrame } from "./BracketFrame";
import { Credits } from "./Credits";
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

type Brands = Awaited<ReturnType<typeof getBrands>>;

/** One series as a compact box: the two clubs (the winner in bold), nothing else; the box opens the series page. */
function BracketBox({ paths, lg, year, s, brands, say, pos, top, dim }: { paths: TeamPaths; lg: string; year: number; s: Series; brands: Brands; say: Say; pos: { y: number; to: number | null; fed: boolean; last?: boolean; final?: boolean }; top?: 0 | 1; dim?: boolean }) {
  const dy = pos.to == null ? 0 : pos.to - pos.y;
  const order = top === 1 ? ([1, 0] as const) : ([0, 1] as const);
  const title = s.winner == null ? say("card.title", { a: s.sides[0].name, b: s.sides[1].name }) : `${s.sides[0].name} ${scoreWords(s, say)} ${s.sides[1].name}`;
  return (
    <Link
      href={seriesPath(paths, lg, year, s)} prefetch={false} title={title}
      className={`bx${pos.fed ? " fed" : ""}${pos.to != null ? (dy < 0 ? " out up" : " out") : ""}${pos.last ? " last" : ""}${pos.final ? " final" : ""}${dim ? " dim" : ""}`}
      style={{ top: `calc(var(--row) * ${pos.y} + 5px)`, "--dy": Math.abs(dy) } as React.CSSProperties}
    >
      {order.map((i) => (
        <span key={i} className={`bxr${s.winner === i ? " won" : ""}`}>
          <TeamLogo url={logoFor(brands, s.sides[i].f, year)} size={16} />
          <span className="nm">{nickname(s.sides[i].name)}</span>
        </span>
      ))}
    </Link>
  );
}

/** The playoff bracket of a season: one half down each side (the conferences where the alignment data splits them), the final in the middle. Draws nothing when there are no playoff games. */
export const SeasonPlayoffs = guard(async function SeasonPlayoffs({ lg, year, conf, div, sp: query }: { lg: string; year: number; conf: string; div: string; sp: Record<string, string | string[] | undefined> }) {
  const sp = await currentSpeaker();
  const say = roundSay(sp);
  const [{ series, names, bracket, brands, align }, paths] = await Promise.all([loadPlayoffs(lg, year, say), getPaths()]);
  if (!series.length) return null;
  const rounds = names.length;
  const b: Bracket = bracket;
  const heading = (r: number, name: string) => <h4><Link href={roundPath(lg, year, r)} prefetch={false} title={sp.say("playoffs.round.title", { round: name })}>{name}</Link></h4>;
  const extra = b.other;
  const slug = (label: string | null) => (label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const choices = b.sides.length === 2 && b.sides.every((s) => s.label) ? b.sides.map((s) => ({ key: slug(s.label), label: s.label! })) : [];
  const only = choices.find((c) => c.key === conf)?.key ?? "";
  const shown = (s: Bracket["sides"][number]) => !only || slug(s.label) === only;
  // Divisions the season had (two or more), within the chosen conference if one is chosen; picking one dims the series that have no club of it.
  const divMap = new Map<string, { label: string; conference: string; short: string | null; ids: Set<number> }>();
  for (const a of align) {
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
      <BracketFrame
        bracket={b} show={shown} heading={(r) => heading(r, names[r - 1])} finalHeading={heading(rounds, names[rounds - 1])}
        box={(i, pos, top) => <BracketBox paths={paths} key={i} lg={lg} year={year} s={series[i]} brands={brands} say={say} pos={pos} top={top} dim={pos.final ? undefined : dims(series[i])} />}
      />
      <p className="note"><Credits say={sp.say} use={["brackets"]} /></p>
      {extra.length ? (
        <>
          <h3>{sp.say("playoffs.other")}</h3>
          <div className="bracket mine">
            {extra.map((i) => <SeriesCard paths={paths} key={`${series[i].sides[0].f}-${series[i].sides[1].f}-${series[i].meeting}`} lg={lg} s={series[i]} brands={brands} year={year} say={say} />)}
          </div>
        </>
      ) : null}
    </section>
  );
});
