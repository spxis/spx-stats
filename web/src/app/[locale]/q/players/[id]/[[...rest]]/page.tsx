import { notFound, permanentRedirect } from "next/navigation";
import { guard } from "@/lib/loadGuard";
import { homeLeague } from "@/lib/playerLinks";
import { playerIdOf, playerPath } from "@/lib/playerPath";
import { getPersonRow, getRedirect } from "@/lib/people";
import { withQuery } from "@/lib/slug";
import { soccerPerson } from "@/lib/soccer";
import { soccerPlayerPath } from "@/lib/soccerPath";

/** The old address, /players/2430 (and anything after it): sent on to the player's page under their league. An id merged into another record (core.person_redirect,
    db/build/185_person_merge.sql) goes to the person who holds its data now, as /nhl/player/<name>-<old id> does. */
export default guard(async function OldPlayerPage({ params, searchParams }: PageProps<"/[locale]/q/players/[id]/[[...rest]]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const n = /^\d{1,9}$/.test(id) ? playerIdOf(id) : null;
  let p = n == null ? null : await getPersonRow(n);
  if (!p && n != null) {
    const kept = await getRedirect(n);
    p = kept != null ? await getPersonRow(kept) : null;
  }
  const lg = p ? await homeLeague(p) : null;
  if (p && !lg) {
    // a person with no league of the five but a World Cup record: their World Cup page
    const sc = await soccerPerson(p.person_id).catch(() => null);
    if (sc) permanentRedirect(withQuery(soccerPlayerPath(sc.person_id, sc.name), sp));
  }
  if (!p || !lg) notFound();
  permanentRedirect(withQuery(playerPath(lg, p.person_id, p.name), sp));
});
