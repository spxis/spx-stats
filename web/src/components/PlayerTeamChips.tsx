import Link from "next/link";
import "./teamchips.css";

/** One team of a player as the Teams column draws it: its page, the logo (the one of the player's last season there, else the current one, dimmed) and the tooltip line. */
export interface TeamChip { key: string; href: string; name: string; logo: string | null; dim: boolean; tip: string }

/** The letters that stand for a club with no logo: the first letter of up to three words of its name. */
export const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase();

/**
 * The teams of one player in the Teams column: a small logo for each of the first few, each linking to the club's page with its name and the
 * years he was there on hover, then "+N" for the rest with the whole list (a club on each line) in its tooltip. A club with no logo shows its initials.
 */
export function PlayerTeamChips({ shown, more, moreLabel }: {
  shown: readonly TeamChip[]; more: readonly TeamChip[];
  /** What a screen reader says for the "+N": "and 3 more teams: ..." */
  moreLabel: string;
}) {
  return (
    <span className="tchips">
      {shown.map((t) => (
        <Link key={t.key} className="tchip" href={t.href} prefetch={false} title={t.tip}>
          {t.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote, already-small logos (see TeamLogo); a plain image keeps the page free of one client component per logo, and the name and years are its alt text and its tooltip, so a logo that fails to load still says which team it was
            <img className={t.dim ? "logo dim" : "logo"} src={t.logo} alt={t.tip} loading="lazy" referrerPolicy="no-referrer" />
          ) : <span className="tinit" aria-hidden="true">{initialsOf(t.name)}</span>}
        </Link>
      ))}
      {more.length ? <span className="tmore" tabIndex={0} role="note" title={[...shown, ...more].map((t) => t.tip).join("\n")} aria-label={moreLabel}>+{more.length}</span> : null}
    </span>
  );
}
