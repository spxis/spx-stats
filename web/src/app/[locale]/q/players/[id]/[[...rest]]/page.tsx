import { notFound, permanentRedirect } from "next/navigation";
import { guard } from "@/lib/loadGuard";
import { homeLeague } from "@/lib/playerLinks";
import { playerIdOf, playerPath } from "@/lib/playerPath";
import { getPersonRow } from "@/lib/people";
import { withQuery } from "@/lib/slug";

/** The old address, /players/2430 (and anything after it): sent on to the player's page under their league. */
export default guard(async function OldPlayerPage({ params, searchParams }: PageProps<"/[locale]/q/players/[id]/[[...rest]]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const n = /^\d{1,9}$/.test(id) ? playerIdOf(id) : null;
  const p = n == null ? null : await getPersonRow(n);
  const lg = p ? await homeLeague(p) : null;
  if (!p || !lg) notFound();
  permanentRedirect(withQuery(playerPath(lg, p.person_id, p.name), sp));
});
