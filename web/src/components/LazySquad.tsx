"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { SoccerSquadTable } from "@/components/SoccerSquadTable";
import { squadPath, squadRowsPath, type SquadLabels, type SquadLine } from "@/lib/soccerSquad";
import "./soccer.css";

type Load = { state: "idle" } | { state: "loading" } | { state: "failed" } | { state: "done"; lines: SquadLine[] };

/**
 * One team's squad in a closed list. A tournament page used to hold all of its squads (32 teams, 800 players, over half a megabyte of markup and
 * payload for lists nobody had opened); now the list holds the team's name, and the squad is fetched from its own kept address the first time the
 * list is opened (the rows, as a few kilobytes of JSON). Without script the opened list shows a link to the squad's own page.
 */
export function LazySquad({ year, slug, labels, texts, children }: {
  year: number; slug: string; labels: SquadLabels; texts: { loading: string; failed: string; open: string }; children: ReactNode;
}) {
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const asked = useRef(false);

  async function ask() {
    if (asked.current) return;
    asked.current = true;
    setLoad({ state: "loading" });
    try {
      const res = await fetch(squadRowsPath(year, slug), { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { lines?: SquadLine[] };
      if (!Array.isArray(body.lines)) throw new Error("no squad");
      setLoad({ state: "done", lines: body.lines });
    } catch {
      asked.current = false; // a second opening tries again
      setLoad({ state: "failed" });
    }
  }

  return (
    <details className="sc-squad" onToggle={(e) => { if (e.currentTarget.open) void ask(); }}>
      <summary>{children}</summary>
      {load.state === "done" ? <SoccerSquadTable lines={load.lines} labels={labels} /> : (
        <p className="note">
          {load.state === "loading" ? texts.loading : load.state === "failed" ? `${texts.failed} ` : null}
          {load.state === "idle" || load.state === "failed" ? <Link href={squadPath(year, slug)} prefetch={false}>{texts.open}</Link> : null}
        </p>
      )}
    </details>
  );
}
