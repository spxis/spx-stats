import Link from "@/components/Link";
import { Rich } from "@/components/i18n/Rich";
import { TeamData } from "@/components/TeamData";
import { TeamLabel } from "@/components/TeamLabel";
import { getClubAffiliations, getFarmClubs } from "@/lib/affiliation";
import { farmStays, independentRuns, parentsOfSeason, parentStays, type Stay } from "@/lib/affiliationView";
import { logoFor } from "@/lib/brand";
import { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { seasonLabel } from "@/lib/leagues";

type Say = Awaited<ReturnType<typeof currentSpeaker>>["say"];

const span = (say: Say, lg: string, first: number, last: number): string =>
  first === last ? seasonLabel(lg, first) : say("affil.years", { from: seasonLabel(lg, first), to: seasonLabel(lg, last) });

/** The clubs of a list of stays, named in a sentence ("A and B"); each is a link with its logo, through TeamLabel. They are clubs of other leagues than the page's, so their addresses and fits come with them. */
function Names({ items, say, brands }: { items: { lg: string; f: number; name: string }[]; say: Say; brands: Awaited<ReturnType<typeof getBrands>> }) {
  return (
    <TeamData leagues={items.map((p) => p.lg)}>
      {items.map((p, i) => (
        <span key={`${p.lg}${p.f}`}>{i ? ` ${say("affil.and")} ` : ""}<span className="tm"><TeamLabel lg={p.lg} f={p.f} name={p.name} logo={logoFor(brands, p.f)} /></span></span>
      ))}
    </TeamData>
  );
}

/** A minor-league club's line under its name: "Farm team of the Boston Bruins, 2005-06–2025-26" (the NHL club(s) of its latest season with one, linked). Nothing while the view or the data is missing. */
export async function ClubAffiliationLine({ lg, f }: { lg: string; f: number }) {
  const rows = await getClubAffiliations(lg, f);
  if (!rows.length) return null;
  const [{ say }, brands] = await Promise.all([currentSpeaker(), getBrands()]);
  const lastYear = Math.max(...rows.map((r) => r.year));
  const now = parentStays(rows).filter((s) => s.last === lastYear);
  if (!now.length) return null;
  return (
    <p className="lede affil">
      <Rich
        text={say(now.length === 1 ? "affil.farmOf" : "affil.farmOfNow")}
        parts={{ parents: <Names items={now} say={say} brands={brands} />, years: now.length === 1 ? span(say, lg, now[0].first, now[0].last) : "" }}
      />
    </p>
  );
}

/** The whole history of a minor-league club's NHL affiliations, as a short list: shown when there is more than one stay or the club was ever independent. */
export async function ClubAffiliationHistory({ lg, f }: { lg: string; f: number }) {
  const rows = await getClubAffiliations(lg, f);
  const stays = parentStays(rows);
  const indep = independentRuns(rows);
  if (stays.length + indep.length < 2) return null;
  const [{ say }, brands] = await Promise.all([currentSpeaker(), getBrands()]);
  return (
    <section className="section">
      <h2>{say("affil.title")}</h2>
      <p className="note">{say("affil.note")}</p>
      <TeamData leagues={stays.map((s) => s.lg)}>
      <ul className="affillist">
        {[...stays.map((s) => ({ first: s.first, last: s.last, s })), ...indep.map((r) => ({ first: r.first, last: r.last, s: null as Stay | null }))]
          .sort((a, b) => a.first - b.first || a.last - b.last)
          .map((x) => (
            <li key={`${x.s?.f ?? "i"}-${x.first}`}>
              {x.s ? <span className="tm"><TeamLabel lg={x.s.lg} f={x.s.f} name={x.s.name} logo={logoFor(brands, x.s.f)} /></span> : <span>{say("affil.independent")}</span>}
              {" · "}<span className="seasoncell">{span(say, lg, x.first, x.last)}</span>
            </li>
          ))}
      </ul>
      </TeamData>
    </section>
  );
}

/** An NHL club's farm teams: every minor-league club that was affiliated with it, by stay, linked, with the league and the seasons. Nothing when it had none on file. */
export async function FarmClubs({ f }: { f: number }) {
  const rows = await getFarmClubs(f);
  if (!rows.length) return null;
  const [{ say }, brands] = await Promise.all([currentSpeaker(), getBrands()]);
  const stays = farmStays(rows);
  return (
    <section className="section">
      <h2>{say("affil.farmTitle")}</h2>
      <p className="note">{say("affil.farmNote")}</p>
      <TeamData leagues={stays.map((s) => s.lg)}>
      <ul className="affillist">
        {stays.map((s) => (
          <li key={`${s.lg}${s.f}${s.first}`}>
            <span className="tm"><TeamLabel lg={s.lg} f={s.f} name={s.name} logo={logoFor(brands, s.f)} /></span>
            {" · "}{s.lg.toUpperCase()}
            {" · "}<span className="seasoncell">{span(say, s.lg, s.first, s.last)}</span>
          </li>
        ))}
      </ul>
      </TeamData>
    </section>
  );
}

/** On a minor-league club's season page: the NHL club(s) it was affiliated with that season, or nothing. */
export async function SeasonParentLine({ lg, f, year }: { lg: string; f: number; year: number }) {
  const rows = (await getClubAffiliations(lg, f)).filter((r) => r.year === year);
  if (!rows.length) return null;
  const [{ say }, brands] = await Promise.all([currentSpeaker(), getBrands()]);
  const parents = parentsOfSeason(rows, year);
  return (
    <p className="lede affil">
      {parents.length ? <Rich text={say("affil.farmOfNow")} parts={{ parents: <Names items={parents} say={say} brands={brands} /> }} /> : rows.some((r) => r.label === "independent") ? say("affil.independent") : null}
    </p>
  );
}

/** On an NHL club's season page: the minor-league clubs affiliated with it that season. */
export async function SeasonFarmLine({ f, year }: { f: number; year: number }) {
  const rows = (await getFarmClubs(f)).filter((r) => r.year === year);
  if (!rows.length) return null;
  const [{ say }, brands] = await Promise.all([currentSpeaker(), getBrands()]);
  const clubs = rows.map((r) => ({ lg: r.league, f: r.franchise_id, name: r.team ?? r.label }));
  return (
    <p className="lede affil">
      <Rich text={say("affil.farmSeason")} parts={{ teams: <Names items={clubs} say={say} brands={brands} /> }} />
      {" "}<Link href="/more-hockey">{say("hockey.more")}</Link>
    </p>
  );
}
