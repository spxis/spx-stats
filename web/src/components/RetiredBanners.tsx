import Link from "@/components/Link";
import { Credits } from "@/components/Credits";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { lastNameOf } from "@/lib/lastName";
import { playerPath } from "@/lib/playerPath";
import { getRetiredNumbers } from "@/lib/retiredNumbers";

/** Retired-number banners on a franchise page. Nothing at all when the archive has none.
 *  Each banner is a kept SVG (senshu-jerseys) so the page HTML stays small.
 *  `kind="hanging"` is the plate (name, number, logo); franchise pages keep `"rafter"`. */
export async function RetiredBanners({
  lg, f, name, kind = "rafter",
}: { lg: string; f: number; name: string; kind?: "rafter" | "hanging" }) {
  const rows = await getRetiredNumbers(lg, f);
  if (!rows.length) return null;
  const { say } = await currentSpeaker();
  return (
    <section className="section" id="retired">
      <h2>{say("team.retired")}</h2>
      <p className="note">{say("team.retiredNote", { name })}</p>
      <ul className="retired-banners">
        {rows.map((r) => {
          const shown = r.name || r.honor_name || String(r.jersey_number);
          const last = lastNameOf(shown);
          const href = r.person_id != null ? playerPath(lg, r.person_id, shown) : null;
          const label = r.league_wide ? `${shown} · ${say("team.retiredLeague")}` : shown;
          const cap = r.league_wide ? say("team.retiredLeague") : last;
          const img = (
            // eslint-disable-next-line @next/next/no-img-element -- kept SVG from this app, not a remote bitmap
            <img
              className="retired-banner"
              src={`/jersey-banner/${f}/${r.retired_number_id}${kind === "hanging" ? "?kind=hanging" : ""}`}
              alt={label}
              width={160}
              height={224}
              loading="lazy"
            />
          );
          return (
            <li key={r.retired_number_id}>
              {href ? (
                <Link href={href} prefetch={false} title={label}>
                  {img}
                  <span className="retired-cap">{cap}</span>
                </Link>
              ) : (
                <span title={label}>
                  {img}
                  <span className="retired-cap">{cap}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="note"><Credits say={say} use={["jerseys"]} /></p>
    </section>
  );
}
