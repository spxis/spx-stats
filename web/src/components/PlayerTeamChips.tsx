"use client";

import Link from "next/link";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { ChipTuple } from "@/lib/teamChips";
import "./teamchips.css";

const Logos = createContext<readonly string[]>([]);
const never = () => () => {};

/** Gives the chips under it the page's list of logo addresses (they are sent once, not on every row). */
export function TeamLogoList({ logos, children }: { logos: readonly string[]; children: ReactNode }) {
  return <Logos value={logos}>{children}</Logos>;
}

/**
 * The teams of one player in the Teams column: a small logo for each of the first few, each linking to the club's page with its name and the
 * years he was there on hover, then "+N" for the rest with the whole list (a club on each line) in its tooltip. A club with no logo shows its initials.
 * A client component taking short arrays: a page of a hundred players draws four hundred chips, and as server markup each was over 400 bytes of the payload on top of the page's own markup.
 */
export function PlayerTeamChips({ shown, more }: {
  shown: readonly ChipTuple[];
  /** The tooltip lines of the teams left out of the row ("+N"). */
  more: readonly string[];
}) {
  const logos = useContext(Logos);
  const { say, fmt } = useSpeaker();
  // The logos are decoration (the link's tooltip names the team, and so does the link), and a logo's address is some 230 bytes: a hundred rows of four were
  // 90 KB of the page. The page leaves the images out and the browser adds them once it is running (a server render and the first browser render agree on none).
  const ready = useSyncExternalStore(never, () => true, () => false);
  const all = [...shown.map((t) => t[2]), ...more];
  return (
    <span className="tchips">
      {shown.map(([href, logo, tip, dim, initials]) => (
        <Link key={href} className="tchip" href={href} prefetch={false} title={tip}>
          {logo >= 0 && logos[logo] ? (ready ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote, already-small logos (see TeamLogo); the name and years are the link's tooltip, so a logo that fails to load still says which team it was
            <img className={dim ? "logo dim" : "logo"} src={logos[logo]} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : null) : <span className="tinit" aria-hidden="true">{initials}</span>}
        </Link>
      ))}
      {more.length ? <span className="tmore" tabIndex={0} role="note" title={all.join("\n")} aria-label={say("players.teamsMore", { n: fmt(more.length), list: all.join("; ") })}>+{more.length}</span> : null}
    </span>
  );
}
