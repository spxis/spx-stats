import Link from "@/components/Link";
import type { ReactNode } from "react";
import { allStarPath, isTie, reasonOf, rosterSides, scoreLine, PRO_BOWL, type AllStarEvent, type AllStarGame, type AllStarMvp, type AllStarSelection } from "@/lib/allStarView";
import type { Speaker } from "@/lib/i18n/i18n";
import "@/components/allstar.css";

type Say = Speaker["say"];

/** Builds a player's address: `getPlayerPaths()` (lib/playerLinks.ts). */
export type PlayerHref = (id: number, name: string, league?: string | null) => string;

/** The name of an event's game: the NFL's is the Pro Bowl. */
export const eventName = (say: Say, lg: string, short: string, year: number): string =>
  PRO_BOWL.has(lg) ? say("allstar.event.proBowl", { year, league: short }) : say("allstar.event", { year, league: short });

export const listName = (say: Say, lg: string, short: string): string =>
  PRO_BOWL.has(lg) ? say("allstar.list.proBowl", { league: short }) : say("allstar.list", { league: short });

/** A venue's name, a link to its page when the archive has one (the address /venue/Q... redirects to the venue's own). */
export function VenueName({ name, wid }: { name: string | null; wid: string | null }): ReactNode {
  if (!name) return null;
  return wid ? <Link href={`/venue/${wid}`}>{name}</Link> : name;
}

/** "Name, Team" for each Most Valuable Player, the name a link to the player's page when the archive knows who he is. */
export function MvpNames({ mvps, lg, player }: { mvps: readonly AllStarMvp[]; lg: string; player: PlayerHref }): ReactNode {
  return (
    <>
      {mvps.map((m, i) => (
        <span key={m.seq} className="asmvp">
          {i ? "; " : ""}
          {m.person_id != null ? <Link href={player(m.person_id, m.name, lg)}>{m.name}</Link> : m.name}
          {m.team_name ? <span className="note"> ({m.team_name})</span> : null}
        </span>
      ))}
    </>
  );
}

const STAGE_KEYS = { semifinal: "allstar.stage.semifinal", final: "allstar.stage.final", championship: "allstar.stage.championship" } as const;

/** "semifinal 1" in the reader's language; a stage the site has no word for (round-robin 2, game 3) is shown as the list names it. */
const stageWord = (say: Say, stage: string): string => {
  const m = /^(semifinal|final|championship)(?:\s+(\d+))?$/.exec(stage.toLowerCase());
  if (m) return `${say(STAGE_KEYS[m[1] as keyof typeof STAGE_KEYS])}${m[2] ? ` ${m[2]}` : ""}`;
  return stage.charAt(0).toUpperCase() + stage.slice(1);
};

/** A game's result as the list prints it ("East 211–186 West"), with its stage and how it was decided. */
export function ResultLine({ g, say }: { g: AllStarGame; say: Say }): ReactNode {
  const by = g.decided_by === "OT" ? say("allstar.ot") : g.decided_by === "SO" ? say("allstar.so") : null;
  return (
    <>
      {g.stage ? <span className="note">{stageWord(say, g.stage)}: </span> : null}
      <span className={isTie(g) ? undefined : "asscore"}>{scoreLine(g)}</span>
      {by ? <span className="note"> ({by})</span> : null}
    </>
  );
}

/** The result of an event: one line per game, or why it was not held. */
export function EventResult({ ev, games, say }: { ev: AllStarEvent; games: readonly AllStarGame[]; say: Say }): ReactNode {
  if (ev.status === "cancelled") return <span className="note">{say("allstar.notHeldWhy", { reason: say(`allstar.reason.${reasonOf(ev.status_reason)}`) })}</span>;
  if (!games.length) return null;
  return (
    <>
      {games.map((g) => (
        <span key={g.game_no} className="asgame"><ResultLine g={g} say={say} /></span>
      ))}
    </>
  );
}

const ROLE_KEYS = { starter: "allstar.role.starter", reserve: "allstar.role.reserve", replacement: "allstar.role.replacement", alternate: "allstar.role.alternate", selection: "allstar.role.selection" } as const;

/** A roster group's name in the reader's language; a group the site has no word for (a position group) is shown as the article names it. */
export function roleWord(say: Say, role: string | null): string | null {
  if (role == null) return null;
  const key = ROLE_KEYS[role as keyof typeof ROLE_KEYS];
  return key ? say(key) : role.charAt(0).toUpperCase() + role.slice(1);
}

/** The players picked, a block per side with its groups (starters, reserves ...); a name is a link where the archive knows the player. */
export function Rosters({ lines, lg, say, player }: { lines: readonly AllStarSelection[]; lg: string; say: Say; player: PlayerHref }): ReactNode {
  const sides = rosterSides(lines);
  if (!sides.length) return <p className="note">{say("allstar.noRosters")}</p>;
  return (
    <div className="asroster">
      {sides.map((s) => (
        <div key={s.side ?? ""} className="asside">
          <h3>{s.side ?? say("allstar.side.none")}</h3>
          {s.groups.map((g) => (
            <div key={g.role ?? ""}>
              {s.groups.length > 1 || g.role ? <h4>{roleWord(say, g.role) ?? ""}</h4> : null}
              <ul>
                {g.players.map((p) => (
                  <li key={p.seq}>
                    {p.position ? <span className="pos">{p.position}</span> : null}
                    {p.person_id != null ? <Link href={player(p.person_id, p.name, lg)}>{p.name}</Link> : p.name}
                    {p.team_name ? <span className="note"> {p.team_name}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The All-Star card of a season page: each game of the season in one block, leading to the game's page. */
export function AllStarCard({ lg, short, events, games, mvps, say, dt, player }: {
  lg: string;
  short: string;
  events: readonly AllStarEvent[];
  games: readonly AllStarGame[];
  mvps: readonly AllStarMvp[];
  say: Say;
  dt: { ymd: (d: Date) => string };
  player: PlayerHref;
}): ReactNode {
  if (!events.length) return null;
  return (
    <section className="section ascard">
      <h2>{say("allstar.card.title")}</h2>
      {events.map((ev) => {
        const g = games.filter((x) => x.year === ev.year && x.event_no === ev.event_no);
        const m = mvps.filter((x) => x.year === ev.year && x.event_no === ev.event_no);
        return (
          <div key={`${ev.year}:${ev.event_no}`} className="aslead">
            <div>
              <Link href={allStarPath(lg, ev.year)}>{eventName(say, lg, short, ev.year)}</Link>
              {ev.first_day ? <span className="note"> · {dt.ymd(new Date(`${ev.first_day}T00:00:00Z`))}</span> : null}
            </div>
            <EventResult ev={ev} games={g} say={say} />
            {ev.venue_name ? <div className="note"><VenueName name={ev.venue_name} wid={ev.venue_wikidata_id} />{ev.city_text ? `, ${ev.city_text}` : ""}</div> : null}
            {m.length ? <div><span className="note">{say("allstar.mvp")}: </span><MvpNames mvps={m} lg={lg} player={player} /></div> : null}
          </div>
        );
      })}
    </section>
  );
}
