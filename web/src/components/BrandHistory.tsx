import { BrandImg } from "./BrandImg";
import { BrandShieldExamples } from "./BrandShieldExamples";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

/**
 * About: the SPXIS marks through the years, the swoosh and the star, and the shield as a container (a preview; no public page uses it yet).
 * The marks are SPXIS's, © SportsInteractive, and say so here; they are not under the site's data licences. Files: public/brand.
 */
export async function BrandHistory() {
  const { say } = await currentSpeaker();
  const years = [
    { year: "1997", name: "sportsinteractive-shield", h: 96, alt: "sportsinteractive", text: say("brand.y1997") },
    { year: "2006", name: "spxn-lockup", h: 40, alt: "spxn.com", text: say("brand.y2006") },
    { year: "2006", name: "spxn-shield", h: 110, alt: "spxn", text: say("brand.y2006shield") },
    { year: "2007", name: "spxis-software-lockup", h: 36, alt: "SPX Interactive Software", text: say("brand.y2007") },
    { year: "2019", name: "spxis-shield", h: 110, alt: "SPXIS", text: say("brand.y2019") },
  ] as const;
  return (
    <section className="section" id="marks">
      <h2>{say("brand.title")}</h2>
      <p>{say("brand.lede")}</p>
      <ul className="bh">
        {years.map((y) => (
          <li key={y.name}>
            <span className="yr">{y.year}</span>
            <span className="pic"><BrandImg name={y.name} height={y.h} alt={y.alt} /></span>
            <p>{y.text}</p>
          </li>
        ))}
      </ul>
      <p className="note">{say("brand.licence")}</p>
      <h3>{say("brand.swooshTitle")}</h3>
      <div className="bsw">
        <figure><BrandImg name="swoosh" height={44} alt="" /><figcaption>{say("brand.swRed")}</figcaption></figure>
        <figure><BrandImg name="swoosh-bright" height={44} alt="" /><figcaption>{say("brand.swBright")}</figcaption></figure>
        <figure><BrandImg name="swoosh-solid" height={44} alt="" /><figcaption>{say("brand.swSolid")}</figcaption></figure>
        <figure><BrandImg name="star" height={44} alt="" /><figcaption>{say("brand.star")}</figcaption></figure>
      </div>
      <h3>{say("brand.shieldTitle")}</h3>
      <p>{say("brand.shieldText")}</p>
      <BrandShieldExamples labels={{ logoTeam: say("brand.exLogoTeam"), abbrTeam: say("brand.exAbbrTeam"), logoNavy: say("brand.exLogoNavy"), abbrNavy: say("brand.exAbbrNavy") }} />
    </section>
  );
}
