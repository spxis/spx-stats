import type { ReactNode } from "react";
import { LogoFitProvider } from "@/components/LogoFitProvider";
import { SlugProvider } from "@/components/SlugProvider";
import { getLogoFits } from "@/lib/data";
import { approvedTable, fitLeagues } from "@/lib/logoFit";
import { packTable, tableOf } from "@/lib/slug";
import { getSlugs } from "@/lib/teamSlugs";

/**
 * The team addresses and logo fits that the parts of a page drawn in the browser look up (usePaths, TeamLogo). They used to ride in the root layout and
 * travelled with every page, the pages that name no team too; now a page carries only those of the leagues it shows. A league's pages get theirs from the
 * layout of `[league]`; a page that names teams of any league (home, the team and player lists, a city, a venue) wraps itself with no `leagues`; a page
 * that draws other leagues' teams besides its own passes them. A league not carried gives a team the numeric address (which redirects) and a logo as it always was.
 */
export async function TeamData({ leagues, children }: { leagues?: readonly string[]; children: ReactNode }) {
  const [slugs, fits] = await Promise.all([getSlugs().catch(() => null), getLogoFits()]);
  return (
    <SlugProvider table={slugs ? packTable(tableOf(slugs, leagues)) : {}}>
      <LogoFitProvider table={approvedTable(fitLeagues(fits, leagues))}>{children}</LogoFitProvider>
    </SlugProvider>
  );
}
