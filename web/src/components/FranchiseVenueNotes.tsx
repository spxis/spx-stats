import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { getFutureVenues, getSpringParks } from "@/lib/venueLayers";
import "./franchiseVenueNotes.css";

const LEAGUE_KEY = { cactus: "team.leagueCactus", grapefruit: "team.leagueGrapefruit" } as const;
const STATUS_KEY = { proposed: "venuesPage.futureProposed", approved: "venuesPage.futureApproved", under_construction: "venuesPage.futureUnderConstruction" } as const;
const place = (city: string | null, region: string | null) => [city, region?.split("-")[1]].filter(Boolean).join(", ");

/**
 * Two small notes under a club's venue table: the spring training parks where it trained (MLB clubs; by years, from api.spring_training_venue) and the
 * venue being built or planned for it (api.future_venue). Each shows only when the club has one; if a view cannot be read, nothing is drawn.
 */
export async function FranchiseVenueNotes({ lg, f }: { lg: string; f: number }) {
  const { say } = await currentSpeaker();
  const [parks, future] = await Promise.all([lg === "mlb" ? getSpringParks() : Promise.resolve([]), getFutureVenues()]);
  const trained = parks
    .flatMap((p) => p.tenants.filter((t) => t.franchise_id === f).map((t) => ({ p, from: t.from, to: t.to })))
    .sort((a, b) => (b.from ?? 0) - (a.from ?? 0));
  const next = future.filter((v) => v.clubs.some((c) => c.franchise_id === f && c.league === lg));
  if (!trained.length && !next.length) return null;
  const today = say("team.today");
  return (
    <>
      {next.length ? (
        <p className="note">
          <b>{say("team.nextHome")}</b>{": "}
          {next.map((v) => [v.name, place(v.city, v.region), v.planned_open_year ? say("venuesPage.planned", { year: v.planned_open_year }) : null, v.status in STATUS_KEY ? say(STATUS_KEY[v.status as keyof typeof STATUS_KEY]) : null].filter(Boolean).join(" · ")).join("; ")}
        </p>
      ) : null}
      {trained.length ? (
        <>
          <h3>{say("team.springHead")}</h3>
          <ul className="springlist">
            {trained.map(({ p, from, to }) => (
              <li key={`${p.wikidata_id}-${from}`}>
                <b>{p.name}</b>
                <span>{[place(p.city, p.region), say(LEAGUE_KEY[p.league === "grapefruit" ? "grapefruit" : "cactus"])].filter(Boolean).join(" · ")}</span>
                <span className="seasoncell">{`${from ?? "…"}–${to ?? today}`}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
