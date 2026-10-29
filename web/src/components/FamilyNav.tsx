import Link from "@/components/Link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { getEuropeTops } from "@/lib/europe";
import { europeLeaguePath } from "@/lib/europePath";
import { codeLabel, familyOf, FAMILIES, memberHref, type FamilyId } from "@/lib/leagueFamilies";
import { isMoreHockey, MORE_HOCKEY_LEVEL } from "@/lib/leagues";

/**
 * The obvious way from a family page (NHL, NBA, …) to its siblings. Trail and "Other leagues" stay;
 * this sits in the heading so PWHL / NHA / WNBA are not buried. Every page of a family draws the chips in
 * the family's own order and only lights the current league; the family's hub page (`family`, no `code`) lights none.
 * The soccer family adds a second row of chips for the European top divisions that have data (`europe` is the code of the one being shown, "" for none).
 */
export async function FamilyNav({ code, family: id, europe }: { code?: string; family?: FamilyId; europe?: string }) {
  // A league on the More hockey page (the AHL): the page of hockey beyond the NHL, then the leagues on it, this one lit.
  if (code && isMoreHockey(code)) {
    const { say } = await currentSpeaker();
    return (
      <nav className="familynav" aria-label={say("league.familyNav")}>
        <span className="familynav-kicker">{say("hockey.nav")}</span>
        <span className="familynav-row">
          <Link href="/more-hockey">{say("hockey.more")}</Link>
          {Object.keys(MORE_HOCKEY_LEVEL).map((m) => (m === code ? <span key={m} aria-current="page">{codeLabel(m)}</span> : <Link key={m} href={memberHref(m)}>{codeLabel(m)}</Link>))}
        </span>
      </nav>
    );
  }
  const family = code ? familyOf(code) : FAMILIES.find((f) => f.id === id);
  if (!family || family.members.length < 2) return null;
  const { say } = await currentSpeaker();
  const international = say("nav.international");
  const tops = family.id === "soccer" ? await getEuropeTops() : [];
  return (
    <nav className="familynav" aria-label={say("league.familyNav")}>
      <span className="familynav-kicker">{say("league.familyNote", { family: say(`league.sport.${family.sport}`) })}</span>
      <span className="familynav-row">
        {family.members.map((m) => (m === code
          ? <span key={m} aria-current="page">{codeLabel(m, international)}</span>
          : <Link key={m} href={memberHref(m)}>{codeLabel(m, international)}</Link>))}
        {tops.map((t) => (t.code === europe
          ? <span key={t.code} aria-current="page">{t.short}</span>
          : <Link key={t.code} href={europeLeaguePath(t.code)}>{t.short}</Link>))}
      </span>
    </nav>
  );
}
