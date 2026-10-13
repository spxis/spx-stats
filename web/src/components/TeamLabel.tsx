import { TeamLogo, type LogoShape } from "./TeamLogo";
import { TeamLink } from "./ui";

/**
 * A team named in a list, table or card: its small logo, then its name as a link. This is the one way to name a team
 * (scripts/teamLabel.test.ts fails on a team link drawn any other way), so every list looks alike.
 *
 * `logo` is required so it cannot be forgotten: pass `logoFor(brands, franchise, year)` from lib/brand.ts, which gives the logo
 * the club wore in that season, or null where we hold none (no logo rather than the wrong one). With a `year` the link
 * opens that team's season; leave it out for the franchise page.
 * Never read `logo_url` off `brandFor()`: that row is picked for its colours and often carries no logo.
 * `href` sends the name to another page about the team (a head-to-head, say) instead of its own.
 * `size` and `shape` are for the larger tiles of a card; a row of a table keeps the default.
 */
export function TeamLabel({ lg, f, name, logo, year, abbr, className, title, href, size, shape }: {
  lg: string; f: number | null | undefined; name: string | null | undefined; logo: string | null | undefined;
  year?: number; abbr?: string; className?: string; title?: string; href?: string; size?: number; shape?: LogoShape;
}) {
  return (
    <>
      <TeamLogo url={logo} size={size} shape={shape} />
      <TeamLink lg={lg} f={f} name={name} year={year} abbr={abbr} className={className} title={title} href={href} />
    </>
  );
}
