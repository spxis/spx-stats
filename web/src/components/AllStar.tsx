import Link from "@/components/Link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { TeamLabel } from "@/components/TeamLabel";
import { TeamLogo } from "@/components/TeamLogo";
import type { Clubs } from "@/lib/allStar";
import { allStarPath, isTie, PRO_BOWL, partsOf, reasonOf, type AllStarEvent, type AllStarGame, type AllStarLeague, type AllStarMvp } from "@/lib/allStarView";
import { resultOf, type ResultView } from "@/lib/allStarResult";
import type { SideView } from "@/lib/allStarSides";
import { sidePair } from "@/lib/allStarSides";
import { gameSides, type EventShape } from "@/lib/allStarView";
import type { Speaker } from "@/lib/i18n/i18n";
import type { SideLook } from "@/lib/seriesLooks";
import "@/components/allstar.css";

type Say = Speaker["say"];

/** Builds a player's address: `getPlayerPaths()` (lib/playerLinks.ts). */
export type PlayerHref = (id: number, name: string, league?: string | null) => string;

/** The name of an event's game: the NFL's is the Pro Bowl. */
export const eventName = (say: Say, lg: string, short: string, year: number): string =>
  PRO_BOWL.has(lg) ? say("allstar.event.proBowl", { year, league: short }) : say("allstar.event", { year, league: short });

export const decadeName = (say: Say, lg: string, short: string, decade: number): string =>
  PRO_BOWL.has(lg) ? say("allstar.decade.proBowl", { decade: `${decade}s`, league: short }) : say("allstar.decade", { decade: `${decade}s`, league: short });

export const listName = (say: Say, lg: string, short: string): string =>
  PRO_BOWL.has(lg) ? say("allstar.list.proBowl", { league: short }) : say("allstar.list", { league: short });

/** The label over a banner: "All-Star Game", or "Pro Bowl" for the NFL. */
export const labelName = (say: Say, lg: string): string => say(PRO_BOWL.has(lg) ? "allstar.label.proBowl" : "allstar.label");

/** A venue's name, a link to its page when the archive has one (the address /venue/Q... redirects to the venue's own). */
export function VenueName({ name, wid }: { name: string | null; wid: string | null }): ReactNode {
  if (!name) return null;
  return wid ? <Link href={`/venue/${wid}`}>{name}</Link> : name;
}

const HEX = /^[0-9a-f]{6}$/i;

/** The mark of a side: the club's logo that season, else its letters on the side's colour (East, the American League, Team McDavid have no logo). */
export function SideCrest({ side, size = 32 }: { side: SideView; size?: number }): ReactNode {
  if (side.logo) return <TeamLogo url={side.logo} size={size} shape="circle" />;
  const hue = side.hue && HEX.test(side.hue) ? `#${side.hue}` : side.brand?.primary_hex && HEX.test(side.brand.primary_hex) ? `#${side.brand.primary_hex}` : "#5d6874";
  return <span className="ascrest" style={{ "--h": hue, "--s": `${size}px` } as CSSProperties} aria-hidden="true"><span>{side.mono}</span></span>;
}

/** A side named: a club as a team label (its logo that season and a link to that season), any other side as its mark and its name. */
export function SideName({ lg, side, year, size = 32 }: { lg: string; side: SideView; year: number | null; size?: number }): ReactNode {
  if (side.f != null) return <TeamLabel lg={lg} f={side.f} name={side.name} logo={side.logo} year={year ?? undefined} size={size} shape="circle" />;
  return <><SideCrest side={side} size={size} /><span className="asname">{side.name}</span></>;
}

/** A side's name over its block in a banner: a link to the club's season when the side is a club, else the plain name. */
export function SideHeading({ href, name }: { href: string | null; name: string }): ReactNode {
  return href ? <Link href={href} prefetch={false}>{name}</Link> : name;
}

/** The two sides of a game as a scoreboard: a row each, the winner's number in the accent colour, the loser quieter. */
export function Scoreboard({ lg, year, left, right, winner, size = 32, label }: { lg: string; year: number | null; left: SideView; right: SideView; winner: 0 | 1 | null; size?: number; label: string }): ReactNode {
  return (
    <div className="asboard" role="group" aria-label={label}>
      {[left, right].map((s, i) => (
        <div key={i} className={`asrow${winner === i ? " win" : winner != null ? " lost" : ""}`}>
          <span className="asteam"><SideName lg={lg} side={s} year={year} size={size} /></span>
          <b className="asn">{s.score}</b>
        </div>
      ))}
    </div>
  );
}

/** The scoreboard's accessible name: "West 7, East 4". */
export const boardLabel = (r: Pick<ResultView, "left" | "right">): string => `${r.left.name} ${r.left.score}, ${r.right.name} ${r.right.score}`;

const HEXD = (h: string) => (HEX.test(h) ? `#${h}` : "#888888");

/** The colours of a pair of sides as variables on the element round them (the banner's --ba/--bb blocks and --ca/--cb lines), so a page may hold several banners. */
export function looksStyle(a: SideLook, b: SideLook): CSSProperties {
  return {
    "--ba": HEXD(a.block), "--bb": HEXD(b.block), "--ia": HEXD(a.on), "--ib": HEXD(b.on),
    "--ca": `light-dark(${HEXD(a.light)}, ${HEXD(a.dark)})`, "--cb": `light-dark(${HEXD(b.light)}, ${HEXD(b.dark)})`,
  } as CSSProperties;
}

/** "Name, Team" for each Most Valuable Player, the name a link to the player's page when the archive knows who he is, the club with its logo and a link when it is certain which club. */
export function MvpNames({ mvps, lg, player, clubs, season }: { mvps: readonly AllStarMvp[]; lg: string; player: PlayerHref; clubs: Clubs; season: number | null }): ReactNode {
  return (
    <>
      {mvps.map((m, i) => {
        const f = clubs.match(m.team_name, season);
        return (
          <Fragment key={m.seq}>
            {i ? "; " : ""}
            <span className="asmvp">
              {m.person_id != null ? <Link href={player(m.person_id, m.name, lg)}>{m.name}</Link> : m.name}
              {f != null ? <span className="asmvpclub"> <TeamLabel lg={lg} f={f} name={m.team_name} logo={clubs.logo(f, season)} year={season ?? undefined} /></span> : m.team_name ? <span className="note"> ({m.team_name})</span> : null}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

const STAGE_KEYS = { semifinal: "allstar.stage.semifinal", final: "allstar.stage.final", championship: "allstar.stage.championship" } as const;
const stageWord = (say: Say, stage: string): string => {
  const m = /^(semifinal|final|championship)(?:\s+(\d+))?$/.exec(stage.toLowerCase());
  if (m) return `${say(STAGE_KEYS[m[1] as keyof typeof STAGE_KEYS])}${m[2] ? ` ${m[2]}` : ""}`;
  return stage.charAt(0).toUpperCase() + stage.slice(1);
};
/** A game's stage as the reader reads it ("Semifinal 1", "Round-robin 2"). */
export const stageName = (say: Say, stage: string | null): string | null => (stage ? stageWord(say, stage) : null);

/** How a game was decided, in words, or null. */
export const byWord = (say: Say, by: "OT" | "SO" | "aggregate" | null | string): string | null => (by === "OT" ? say("allstar.ot") : by === "SO" ? say("allstar.so") : by === "aggregate" ? say("allstar.aggregate") : null);

/** One game as a strip: its stage, both sides with their marks, the score between, the winner in bold. Used for the games of a series, a round robin and a card's results. */
export function GameStrip({ lg, g, host, year, look, say }: { lg: string; g: AllStarGame; host: number | null; year: number | null; look: Clubs; say: Say }): ReactNode {
  const { left, right } = gameSides(g, host);
  const [l, r] = sidePair(look, year, left, right);
  const w = isTie(g) ? null : left.score > right.score ? 0 : 1;
  const by = byWord(say, g.decided_by);
  const stage = stageName(say, g.stage);
  return (
    <div className="asstrip">
      {stage ? <span className="asstage">{stage}</span> : null}
      <span className={`asteam${w === 0 ? " win" : ""}`}><SideName lg={lg} side={l} year={year} size={28} /></span>
      <span className="asmid"><b className={w === 0 ? "win" : undefined}>{l.score}</b><span aria-hidden="true">–</span><b className={w === 1 ? "win" : undefined}>{r.score}</b></span>
      <span className={`asteam r${w === 1 ? " win" : ""}`}><SideName lg={lg} side={r} year={year} size={28} /></span>
      {by ? <span className="note asby">{by}</span> : null}
    </div>
  );
}

const ROLE_KEYS = { starter: "allstar.role.starter", reserve: "allstar.role.reserve", replacement: "allstar.role.replacement", alternate: "allstar.role.alternate", selection: "allstar.role.selection" } as const;

/** A roster group's name in the reader's language; a group the site has no word for (a position group) is shown as the article names it. */
export function roleWord(say: Say, role: string | null): string | null {
  if (role == null) return null;
  const key = ROLE_KEYS[role as keyof typeof ROLE_KEYS];
  return key ? say(key) : role.charAt(0).toUpperCase() + role.slice(1);
}

/** The kind of event in a few words ("A tournament of 3 games"), or null for a single game. */
export function formatLine(say: Say, shape: EventShape, games: number): string | null {
  if (shape === "bracket") return say("allstar.line.tournament", { n: games });
  if (shape === "series") return say("allstar.line.series", { n: games });
  if (shape === "games") return say("allstar.line.games", { n: games });
  return null;
}

/** The star on a banner: the emblem the All-Star block wears where the champion's banner has its trophy. */
function StarMark(): ReactNode {
  return (
    <svg viewBox="0 0 64 64" className="asstar" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M32 11.5l6.2 14 15.1 1.4-11.4 10 3.4 14.9L32 43.6l-13.3 8.2 3.4-14.9-11.4-10 15.1-1.4z" fill="currentColor" />
    </svg>
  );
}

/**
 * The All-Star block of a season page, in the banner style the champion's has (its own label, the result as a scoreboard, the format line, the Most Valuable Player with his
 * club's logo, the venue, a link to the game's page); the champion's banner and this one share a row (`bannerrow`) and stack on a phone. The same block for every league: the
 * Pro Bowl, the Mid-Summer Classic's two leagues, the NHL's tournament with its final.
 */
export function AllStarBanner({ lg, short, ev, data, clubs, say, dt, player }: {
  lg: string; short: string; ev: AllStarEvent; data: AllStarLeague; clubs: Clubs; say: Say; dt: { ymd: (d: Date) => string }; player: PlayerHref;
}): ReactNode {
  const { games, mvps } = partsOf(data, ev);
  const res = resultOf(lg, clubs, ev, games);
  const season = ev.season_year;
  const day = ev.first_day ? dt.ymd(new Date(`${ev.first_day}T00:00:00Z`)) : null;
  const line = res ? formatLine(say, res.shape, res.games) : null;
  const winnerSide = res && res.winner != null ? (res.winner === 0 ? res.left : res.right) : null;
  return (
    <section className="banner withcup asbanner" style={res ? looksStyle(res.looks[0], res.looks[1]) : undefined} aria-label={eventName(say, lg, short, ev.year)}>
      <figure className="bigcup asfig"><StarMark /></figure>
      <div className="bbody">
        <span className="cup"><Link href={allStarPath(lg, ev.year)}>{labelName(say, lg)}</Link></span>
        {day ? <span className="badge">{day}</span> : <span />}
        {ev.status === "cancelled" ? (
          <span className="how">{say("allstar.notHeldWhy", { reason: say(`allstar.reason.${reasonOf(ev.status_reason)}`) })}</span>
        ) : res ? (
          <div className="aswho">
            <Scoreboard lg={lg} year={season} left={res.left} right={res.right} winner={res.winner} size={36} label={boardLabel(res)} />
            <span className="how asnote">
              {[res.stage ? stageName(say, res.stage) : null, byWord(say, res.by), line].filter(Boolean).join(" · ")}
              {winnerSide ? <>{res.stage || res.by || line ? " · " : ""}{say("gm.won", { team: winnerSide.name })}</> : null}
            </span>
          </div>
        ) : null}
        {mvps.length ? <span className="how asline"><span className="aslab">{say(mvps.length > 1 ? "allstar.fact.mvps" : "allstar.fact.mvp")}</span> <MvpNames mvps={mvps} lg={lg} player={player} clubs={clubs} season={season} /></span> : null}
        {ev.venue_name ? <span className="how asline"><span className="aslab">{say("allstar.fact.venue")}</span> <VenueName name={ev.venue_name} wid={ev.venue_wikidata_id} />{ev.city_text ? <span className="note">, {ev.city_text}</span> : null}</span> : null}
        <span className="how asline asopen"><Link href={allStarPath(lg, ev.year)}>{say("allstar.card.more")}{" →"}</Link></span>
      </div>
    </section>
  );
}

/**
 * One event of the league's list as a card: the year (a link to the game's page), the day, the result as a scoreboard with the logos of the sides that are clubs, the
 * kind of event, the venue and host club, the Most Valuable Player. A game not held is a quiet card with its reason.
 */
export function EventCard({ lg, ev, data, clubs, say, dt, player }: {
  lg: string; ev: AllStarEvent; data: AllStarLeague; clubs: Clubs; say: Say; dt: { ymd: (d: Date) => string }; player: PlayerHref;
}): ReactNode {
  const { games, mvps } = partsOf(data, ev);
  const res = resultOf(lg, clubs, ev, games);
  const season = ev.season_year;
  const day = ev.first_day ? dt.ymd(new Date(`${ev.first_day}T00:00:00Z`)) : null;
  const line = res ? formatLine(say, res.shape, res.games) : null;
  const host = ev.host_franchise;
  const kicker = [res?.stage ? stageName(say, res.stage) : null, res ? byWord(say, res.by) : null, line].filter(Boolean).join(" · ");
  return (
    <article className={`ascardx${ev.status === "cancelled" ? " off" : ""}`}>
      <header>
        <Link href={allStarPath(lg, ev.year)} className="asyear">{ev.event_no > 1 ? `${ev.year} (${ev.event_no})` : ev.year}</Link>
        {day ? <span className="note">{day}</span> : null}
      </header>
      {ev.status === "cancelled" ? (
        <p className="note">{say("allstar.notHeldWhy", { reason: say(`allstar.reason.${reasonOf(ev.status_reason)}`) })}</p>
      ) : res ? (
        <>
          <Scoreboard lg={lg} year={season} left={res.left} right={res.right} winner={res.winner} size={26} label={boardLabel(res)} />
          {kicker ? <p className="note askick">{kicker}</p> : null}
        </>
      ) : null}
      {ev.venue_name || ev.host_name ? (
        <p className="asline">
          {ev.venue_name ? <><VenueName name={ev.venue_name} wid={ev.venue_wikidata_id} />{ev.city_text ? <span className="note">, {ev.city_text}</span> : null}</> : null}
          {host != null && ev.host_name ? <span className="ashost"> <TeamLabel lg={lg} f={host} name={ev.host_name} logo={clubs.logo(host, season)} year={season ?? undefined} /></span> : null}
        </p>
      ) : null}
      {mvps.length ? <p className="asline"><span className="aslab">{say("allstar.mvp")}</span> <MvpNames mvps={mvps} lg={lg} player={player} clubs={clubs} season={season} /></p> : null}
    </article>
  );
}

/** A host club: its logo that season and a link to the season, or its name as text when the archive has no franchise for it. */
export function HostClub({ lg, ev, clubs }: { lg: string; ev: AllStarEvent; clubs: Clubs }): ReactNode {
  if (!ev.host_name) return null;
  if (ev.host_franchise == null) return ev.host_name;
  return <TeamLabel lg={lg} f={ev.host_franchise} name={ev.host_name} logo={clubs.logo(ev.host_franchise, ev.season_year)} year={ev.season_year ?? undefined} />;
}


/** The cards of a list of events, in the order given. */
export function EventCards({ lg, events, data, clubs, say, dt, player }: {
  lg: string; events: readonly AllStarEvent[]; data: AllStarLeague; clubs: Clubs; say: Say; dt: { ymd: (d: Date) => string }; player: PlayerHref;
}): ReactNode {
  return (
    <div className="ascards">
      {events.map((ev) => <EventCard key={`${ev.year}:${ev.event_no}`} lg={lg} ev={ev} data={data} clubs={clubs} say={say} dt={dt} player={player} />)}
    </div>
  );
}
