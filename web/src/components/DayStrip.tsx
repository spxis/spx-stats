import Link from "next/link";
import "./scores.css";

/** One cell of the week strip: the weekday and date, how many games the day held, and where it leads (a link) or nothing (a button the page handles). */
export interface StripDay {
  /** The day, as 2026-10-14. */
  key: string;
  weekday: string;
  date: string;
  games: number;
  /** "game" or "games", as the language has it, written next to the count when there is room. */
  word: string;
  /** The whole description for a screen reader, such as "Wednesday, October 14, 2026: 5 games". */
  label: string;
  href?: string;
}

/**
 * The strip of seven days with an "N games" badge under each date, shared by a league's scores page (every day a link to its scoreboard) and a season page
 * (every day a button: the page shows that day's games in place). The cell for the chosen day is marked `aria-current="date"`. It draws no text of its own,
 * so a server page and a client page can both use it.
 */
export function DayStrip({ days, current, aria, onPick }: { days: StripDay[]; current: string; aria: string; onPick?: (day: string) => void }) {
  return (
    <nav className="daystrip" aria-label={aria}>
      {days.map((d) => {
        const inside = (
          <>
            <span className="wd">{d.weekday}</span>
            <span className="md">{d.date}</span>
            {d.games ? <span className="ct"><b>{d.games}</b><span className="cw">{d.word}</span></span> : <span className="ct none" aria-hidden="true">–</span>}
          </>
        );
        const on = d.key === current ? "date" : undefined;
        return d.href && !onPick
          ? <Link key={d.key} href={d.href} prefetch={false} className={d.games ? "has" : undefined} aria-current={on} aria-label={d.label}>{inside}</Link>
          : <button key={d.key} type="button" className={d.games ? "has" : undefined} aria-current={on} aria-label={d.label} onClick={() => onPick?.(d.key)}>{inside}</button>;
      })}
    </nav>
  );
}
