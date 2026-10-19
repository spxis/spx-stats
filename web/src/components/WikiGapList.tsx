"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { officialLinks } from "@/lib/officialLinks";
import { playedScoreMissing } from "@/lib/playedLate";
import { gameCitation, groupByLeague, localDay, wikiEditUrl, wikiViewUrl, type GapGame } from "@/lib/wikiHelp";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./wikihelp.css";

const subscribe = () => () => {};

/** The viewer's clock, read once when the list is shown. The server and the first browser render have none, so a kept page never holds a time-dependent list. */
function useViewNow(): number | null {
  const stamp = useRef<number | null>(null);
  return useSyncExternalStore(
    subscribe,
    () => {
      if (stamp.current == null) stamp.current = Date.now();
      return stamp.current;
    },
    () => null,
  );
}

function CopyButton({ text }: { text: string }) {
  const { say } = useSpeaker();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => undefined);
  };
  return <button type="button" className="wkcopy" onClick={copy}>{copied ? say("wiki.copied") : say("wiki.copy")}</button>;
}

function Row({ g, now }: { g: GapGame; now: number }) {
  const { say, dt } = useSpeaker();
  const links = officialLinks({
    league: g.league, date: g.date, away: g.awayAbbr, home: g.homeAbbr, awayName: g.away, homeName: g.home,
    year: g.year, phase: g.phase, nhlId: g.nhlId, nflWeek: g.nflWeek, status: "scheduled", startsAt: g.startsAt, now,
  });
  const official = links.find((l) => l.kind === "box") ?? links.find((l) => l.kind === "day") ?? null;
  const cite = gameCitation(g, links, localDay(now));
  const labels = [g.away, g.home];
  return (
    <li className="wkgame">
      <div className="wkhead">
        <b>{g.away} {say("wiki.at")} {g.home}</b>
        <span className="wkdate">{dt.monthDayShort(new Date(`${g.date}T00:00:00Z`))}</span>
      </div>
      <div className="wkline">
        <span className="wklabel">{say("wiki.articles")}</span>
        <ul className="wkarticles">
          {g.articles.map((title, i) => (
            <li key={title}>
              <span>{i < 2 ? labels[i] : say("wiki.postseason", { year: g.year })}</span>{" "}
              <a href={wikiEditUrl(title)} target="_blank" rel="noopener noreferrer">{say("wiki.edit")}</a>
              <span aria-hidden="true"> · </span>
              <a href={wikiViewUrl(title)} target="_blank" rel="noopener noreferrer">{say("wiki.read")}</a>
            </li>
          ))}
        </ul>
      </div>
      {official ? (
        <div className="wkline">
          <span className="wklabel">{say("wiki.official")}</span>
          <a href={official.href} target="_blank" rel="noopener noreferrer">{official.kind === "box" ? say("wiki.officialGame") : say("wiki.officialDay")}</a>
        </div>
      ) : null}
      {cite ? (
        <div className="wkline">
          <span className="wklabel">{say("wiki.cite")}</span>
          <code className="wkcite">{cite.template}</code>
          <CopyButton text={cite.template} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The games still waiting for a score on Wikipedia: those the page was given that, on the reader's clock, began over 4 hours ago and
 * within 14 days (lib/playedLate.ts). The server sends every candidate; only the browser knows the time.
 */
export function WikiGapList({ games }: { games: GapGame[] }) {
  const { say, plural } = useSpeaker();
  const now = useViewNow();
  if (now == null) return <p className="note">{say("wiki.loading")}</p>;
  const due = games.filter((g) => playedScoreMissing({ status: "scheduled", startsAt: g.startsAt, gameDate: g.date }, now));
  if (!due.length) return <p className="note">{say("wiki.none")}</p>;
  return (
    <div className="wkgroups">
      <p className="note">{plural("count.games", due.length)}</p>
      {groupByLeague(due).map(({ league, games: list }) => (
        <section key={league} className="wkleague">
          <h3>{league.toUpperCase()} <span className="note">{plural("count.games", list.length)}</span></h3>
          <ul className="wklist">
            {list.map((g) => <Row key={`${g.league}-${g.id}`} g={g} now={now} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
