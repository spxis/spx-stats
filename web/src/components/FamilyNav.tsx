import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { codeLabel, familyOf, familySiblings, familyTitle, memberHref } from "@/lib/leagueFamilies";

/**
 * The obvious way from a family page (NHL, NBA, …) to its siblings. Trail and "Other leagues" stay;
 * this sits in the heading so PWHL / NHA / WNBA are not buried.
 */
export async function FamilyNav({ code }: { code: string }) {
  const family = familyOf(code);
  const sibs = familySiblings(code);
  if (!family || !sibs.length) return null;
  const { say } = await currentSpeaker();
  const soccerWord = say("nav.soccer");
  return (
    <nav className="familynav" aria-label={say("league.familyNav")}>
      <span className="familynav-kicker">{say("league.familyNote", { family: familyTitle(family, soccerWord) })}</span>
      <span className="familynav-row">
        <span aria-current="page">{codeLabel(code, soccerWord)}</span>
        {sibs.map((m) => (
          <Link key={m} href={memberHref(m)}>{codeLabel(m, soccerWord)}</Link>
        ))}
      </span>
    </nav>
  );
}
