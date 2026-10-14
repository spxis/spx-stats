import Link from "next/link";
import { BracketFrame, type BoxPos } from "@/components/BracketFrame";
import { SoccerFlag } from "@/components/SoccerFlag";
import { buildBracket } from "@/lib/bracket";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Match } from "@/lib/soccer";
import { goalsOf } from "@/lib/soccerH2H";
import { teamName } from "@/lib/soccerNames";
import { soccerMatchPath } from "@/lib/soccerPath";
import { knockoutOf, type SoccerTie } from "@/lib/soccerBracket";
import { scoreLines, stageName } from "@/lib/soccerView";
import "./soccer.css";

/**
 * The knockout rounds as the bracket the playoff pages draw (components/BracketFrame.tsx, layout in lib/bracket.ts, ties from lib/soccerBracket.ts): one half
 * down each side, the final in the middle, a line from each match to the one its winner plays next. Each box shows both teams' round flags, names and goals,
 * with the penalties in brackets and a note under it for extra time or a replay; the box opens the match (a replayed tie opens the replay). The third-place
 * match leads nowhere, so it is shown apart below, and so is any match the tree has no place for.
 *
 * Under it the tournament page draws the two finalists' roads with kyogijo's `roadToFinal` (components/SoccerRoad.tsx, from the same matches).
 */
export async function SoccerKnockout({ matches }: { matches: Match[] }) {
  const { say, locale } = await currentSpeaker();
  const ko = knockoutOf(matches);
  if (!ko.ties.length && !ko.third) return null;
  const bracket = buildBracket(ko.ties, ko.round, () => null);
  const name = (m: Match, id: string) => (id === m.home_team_id ? teamName({ name: m.home, slug: m.home_slug, flag: m.home_flag }, locale) : teamName({ name: m.away, slug: m.away_slug, flag: m.away_flag }, locale));
  const flagOf = (m: Match, id: string) => (id === m.home_team_id ? m.home_flag : m.away_flag);
  const pensOf = (m: Match, id: string) => (m.shootout ? (id === m.home_team_id ? m.home_penalties : m.away_penalties) : null);
  const heading = (stage: string) => <h4>{stageName(say, stage)}</h4>;

  const box = (i: number, pos: BoxPos, top?: 0 | 1) => {
    const t: SoccerTie = ko.ties[i];
    const last = t.matches.at(-1)!;
    const dy = pos.to == null ? 0 : pos.to - pos.y;
    const order = top === 1 ? ([1, 0] as const) : ([0, 1] as const);
    const notes = [t.matches.length > 1 ? say("wc.ko.replay") : null, last.extra_time ? say("wc.aetShort") : null].filter((x): x is string => !!x);
    const title = `${name(last, t.teams[0])} ${last.home_team_id === t.teams[0] ? last.home_goals : last.away_goals}–${last.home_team_id === t.teams[0] ? last.away_goals : last.home_goals} ${name(last, t.teams[1])}${scoreLines(say, last).note ? ` (${scoreLines(say, last).note})` : ""}`;
    return (
      <Link
        key={i} href={soccerMatchPath(last.year, last.match_id, last.home, last.away)} prefetch={false} title={title}
        className={`bx${pos.fed ? " fed" : ""}${pos.to != null ? (dy < 0 ? " out up" : " out") : ""}${pos.last ? " last" : ""}${pos.final ? " final" : ""}`}
        style={{ top: `calc(var(--row) * ${pos.y} + 5px)`, "--dy": Math.abs(dy) } as React.CSSProperties}
      >
        {order.map((k) => {
          const id = t.teams[k];
          const pens = pensOf(last, id);
          return (
            <span key={id} className={`bxr${t.winner === id ? " won" : ""}`}>
              <SoccerFlag code={flagOf(last, id)} />
              <span className="nm">{name(last, id)}</span>
              <span className="sc">{goalsOf(last, id)[0]}{pens != null ? <small>({pens})</small> : null}</span>
            </span>
          );
        })}
        {notes.length ? <span className="bxn">{notes.join(" · ")}</span> : null}
      </Link>
    );
  };

  /** A match as a card (the third-place match, and any match the bracket has no place for). */
  const card = (m: Match) => {
    const s = scoreLines(say, m);
    const side = (id: string, goals: number, pens: number | null) => (
      <div className={"row" + (m.winner_team_id === id ? " win" : "")}>
        <span className="sct"><SoccerFlag code={flagOf(m, id)} />{name(m, id)}</span>
        <span className="n">{goals}{pens != null && m.shootout ? <small> ({pens})</small> : null}</span>
      </div>
    );
    return (
      <Link className="sc-tie" key={m.match_id} href={soccerMatchPath(m.year, m.match_id, m.home, m.away)} prefetch={false}>
        {side(m.home_team_id, m.home_goals, m.home_penalties)}
        {side(m.away_team_id, m.away_goals, m.away_penalties)}
        {s.note ? <div className="sub">{s.note}</div> : null}
      </Link>
    );
  };

  const loose = bracket.other.flatMap((i) => ko.ties[i].matches.slice(-1));
  return (
    <>
      {ko.ties.length ? (
        <BracketFrame
          bracket={bracket} row={78} colw={150}
          heading={(r) => heading(ko.stages[r - 1])} finalHeading={heading(ko.stages[ko.stages.length - 1])}
          box={box}
        />
      ) : null}
      {ko.third || loose.length ? (
        <div className="sc-apart">
          {ko.third ? <div><h3>{stageName(say, "third_place")}</h3>{card(ko.third)}</div> : null}
          {loose.map((m) => <div key={m.match_id}><h3>{stageName(say, m.stage_key)}</h3>{card(m)}</div>)}
        </div>
      ) : null}
    </>
  );
}
