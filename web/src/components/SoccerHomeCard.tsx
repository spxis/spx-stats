import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { getTournaments } from "@/lib/soccer";
import { SOCCER_PATH } from "@/lib/soccerPath";
import "./soccer.css";

/** The soccer card beside the five leagues on the home page. Nothing at all until the archive holds a World Cup (and when it cannot be read: the home page stays whole). */
export async function SoccerHomeCard() {
  const { say, plural } = await currentSpeaker();
  const list = await getTournaments().catch(() => []);
  if (!list.length) return null;
  const last = list.filter((t) => t.winner).sort((a, b) => b.year - a.year)[0];
  return (
    <Link className="card" href={SOCCER_PATH} style={{ "--lg": "var(--soccer)" } as React.CSSProperties}>
      <h3>{say("nav.soccer")}</h3>
      <span>{say("soccer.homeName")}</span>
      <span className="span">{say("soccer.span", { from: list[0].year, to: list.at(-1)!.year, tournaments: plural("count.tournaments", list.length) })}</span>
      {last ? <span className="note">{say("soccer.latest", { year: last.year, champion: last.winner ?? "" })}</span> : null}
    </Link>
  );
}
