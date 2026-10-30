import Link from "@/components/Link";
import type { ReactNode } from "react";
import { TeamLabel } from "@/components/TeamLabel";
import { TrophySprite } from "@/components/TrophySprite";
import { logoFor, type BrandMap } from "@/lib/brand";
import { bigSeasons, factsOf, holders, leagueOfCode, streaks, tally, trophyPath, type TrophyInfo, type TrophyRow } from "@/lib/awardTrophy";
import { trophyArt } from "@/lib/cups";
import { TROPHY_SPRITE } from "@/lib/trophySprite";
import { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { leagueInfo, seasonLabel } from "@/lib/leagues";
import { getPlayerPaths } from "@/lib/playerLinks";
import { seasonPath } from "@/lib/slug";
import "@/components/trophies.css";

/* The pieces of the trophy pages, drawn on the server (no script): the list of a league's trophies as cards, and the boards (who won most, the longest runs, the
   biggest seasons). They read nothing: the page passes the winners (lib/trophyData.ts) and these add them up (lib/awardTrophy.ts). */

const KIND_ORDER: Record<string, number> = { championship: 0, team_award: 1, person_award: 2 };
/** Trophies in the order a page lists them: championships, then team awards, then awards to people, each by name. */
export function orderTrophies(list: readonly TrophyInfo[]): TrophyInfo[] {
  return [...list].sort((a, b) => (KIND_ORDER[a.kind] ?? 3) - (KIND_ORDER[b.kind] ?? 3) || a.name.localeCompare(b.name));
}

type Look = { brands: BrandMap; player: (id: number, name: string, league?: string | null) => string };

/** A winner named as a link: a player to their page, a franchise as its label with logo, else the bare name. */
function Winner({ r, look, league }: { r: Pick<TrophyRow, "person_id" | "franchise_id" | "winner" | "year">; look: Look; league: string }): ReactNode {
  if (r.person_id != null) return <Link href={look.player(r.person_id, r.winner ?? "", league)} prefetch={false}>{r.winner}</Link>;
  if (r.franchise_id != null) return <TeamLabel lg={league} f={r.franchise_id} name={r.winner} logo={logoFor(look.brands, r.franchise_id, r.year)} year={r.year} />;
  return r.winner;
}

/** The cards of some trophies (with `spriteFile` their drawings are named by address in the all-trophies sprite file, else the page carries them: `sprite`): its drawing, name, what it honours, when it was first given and who holds it (the winners of its latest season). */
export async function TrophyCards({ infos, rows, sprite = true, spriteFile = false }: { infos: readonly TrophyInfo[]; rows: readonly TrophyRow[]; sprite?: boolean; spriteFile?: boolean }) {
  const { say, plural } = await currentSpeaker();
  const [brands, player] = await Promise.all([getBrands(), getPlayerPaths()]);
  const look: Look = { brands, player };
  const byCode = new Map<string, TrophyRow[]>();
  for (const r of rows) (byCode.get(r.award_code) ?? byCode.set(r.award_code, []).get(r.award_code)!).push(r);
  const held = holders(rows);
  const list = orderTrophies(infos);
  const arts = list.map((t) => trophyArt(t.code, t.kind));
  return (
    <>
      {sprite ? <TrophySprite arts={arts} /> : null}
      <ul className="trophycards" aria-label={say("trophies.cardAria")}>
        {list.map((t, i) => {
          const facts = factsOf(byCode.get(t.code) ?? []);
          const now = held.get(t.code);
          const lg = leagueOfCode(t.code);
          const shownNow = now ? now.rows.slice(0, 3) : [];
          return (
            <li key={t.code} className="trophycard">
              <svg className="trophyart" aria-hidden="true" focusable="false"><use href={`${spriteFile ? TROPHY_SPRITE : ""}#trophy-${arts[i].key}`} /></svg>
              <div className="trophybody">
                <h3><Link href={trophyPath(t.code)} prefetch={false}>{t.name}</Link></h3>
                <p className="note">
                  {say(`trophies.kind.${t.kind}` as "trophies.kind.person_award")}
                  {facts.first != null ? ` · ${say("trophies.firstAwarded", { season: seasonLabel(lg, facts.first) })}` : ""}
                  {facts.given ? ` · ${plural("count.winners", facts.given)}` : ""}
                </p>
                {t.description ? <p className="trophydesc">{t.description}</p> : null}
                {now ? (
                  <p className="holder">
                    <span className="note">{say("trophies.latest", { season: seasonLabel(lg, now.year) })}: </span>
                    {shownNow.map((r, j) => <span key={j} className="holderwho">{j ? ", " : ""}<Winner r={r} look={look} league={lg} /></span>)}
                    {now.rows.length > shownNow.length ? <span className="note"> {say("trophies.more", { count: now.rows.length - shownNow.length })}</span> : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The plain table a board is drawn in: the order is the ranking, so no column sorts. */
function Board({ id, title, note, head, children }: { id: string; title: string; note?: string; head: ReactNode; children: ReactNode }) {
  return (
    <section className="section trophyboard" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {note ? <p className="note">{note}</p> : null}
      <div className="tablebox"><table><thead>{head}</thead><tbody>{children}</tbody></table></div>
    </section>
  );
}

const span = (lg: string, from: number, to: number) => (from === to ? seasonLabel(lg, from) : `${seasonLabel(lg, from)}–${seasonLabel(lg, to)}`);

/**
 * The boards over some winners: who won most (`people`: the people with the most awards; `teams`: the clubs with the most championships), the longest runs
 * and the people with the most awards in a season. Each is left out when there is nothing to show. `trophy` is set on one trophy's own page, where the
 * award is known and each board is about that award alone.
 */
export async function TrophyBoards({ rows, trophy, size = 10, parts = ["people", "teams", "streaks", "seasons"] }: {
  rows: readonly TrophyRow[]; trophy?: TrophyInfo; size?: number; parts?: readonly ("people" | "teams" | "streaks" | "seasons")[];
}) {
  const { say } = await currentSpeaker();
  const [brands, player] = await Promise.all([getBrands(), getPlayerPaths()]);
  const look: Look = { brands, player };
  const isTeam = trophy ? trophy.kind !== "person_award" : false;
  const people = tally(rows.filter((r) => r.kind === "person_award" && r.person_id != null)).slice(0, size);
  const clubs = tally(rows.filter((r) => r.kind === "championship" && r.franchise_id != null)).slice(0, size);
  const winsOfTrophy = trophy ? tally(rows).slice(0, size) : [];
  const runs = streaks(rows).slice(0, size);
  const big = bigSeasons(rows).slice(0, size);
  const lgOf = (code: string) => leagueOfCode(code);
  const out: ReactNode[] = [];

  if (trophy && winsOfTrophy.length && winsOfTrophy[0].n > 1) {
    const lg = lgOf(trophy.code);
    out.push(
      <Board key="wins" id="tb-wins" title={say("trophies.mostWins")}
        head={<tr><th scope="col">{say(isTeam ? "col.team" : "trophies.col.who")}</th><th scope="col" className="num">{say("trophies.col.wins")}</th><th scope="col">{say("trophies.col.span")}</th></tr>}>
        {winsOfTrophy.filter((t) => t.n > 1).map((t) => (
          <tr key={t.key}>
            <td className="team"><Winner r={{ person_id: t.person_id, franchise_id: t.franchise_id, winner: t.name, year: t.last }} look={look} league={lg} /></td>
            <td className="num">{t.n}</td>
            <td>{span(lg, t.first, t.last)}</td>
          </tr>
        ))}
      </Board>,
    );
  }
  if (!trophy && parts.includes("people") && people.length) {
    out.push(
      <Board key="people" id="tb-people" title={say("trophies.mostAwards")} note={say("trophies.mostAwardsNote")}
        head={<tr><th scope="col">{say("trophies.col.who")}</th><th scope="col" className="num">{say("trophies.col.awards")}</th><th scope="col" className="num">{say("trophies.col.kinds")}</th><th scope="col">{say("trophies.col.span")}</th></tr>}>
        {people.map((t) => (
          <tr key={t.key}>
            <td className="team"><Winner r={{ person_id: t.person_id, franchise_id: null, winner: t.name, year: t.last }} look={look} league={t.league} /></td>
            <td className="num">{t.n}</td>
            <td className="num">{t.awards}</td>
            <td>{span(t.league, t.first, t.last)}</td>
          </tr>
        ))}
      </Board>,
    );
  }
  if (!trophy && parts.includes("teams") && clubs.length) {
    out.push(
      <Board key="teams" id="tb-teams" title={say("trophies.mostTitles")} note={say("trophies.mostTitlesNote")}
        head={<tr><th scope="col">{say("col.team")}</th><th scope="col">{say("col.league")}</th><th scope="col" className="num">{say("col.titles")}</th><th scope="col">{say("trophies.col.span")}</th></tr>}>
        {clubs.map((t) => (
          <tr key={t.key}>
            <td className="team"><Winner r={{ person_id: null, franchise_id: t.franchise_id, winner: t.name, year: t.last }} look={look} league={t.league} /></td>
            <td>{leagueInfo(t.league)?.short ?? t.league.toUpperCase()}</td>
            <td className="num">{t.n}</td>
            <td>{span(t.league, t.first, t.last)}</td>
          </tr>
        ))}
      </Board>,
    );
  }
  if (parts.includes("streaks") && runs.length) {
    out.push(
      <Board key="runs" id="tb-runs" title={say("trophies.streaks")} note={say("trophies.streaksNote")}
        head={<tr><th scope="col">{say("trophies.col.who")}</th>{trophy ? null : <th scope="col">{say("col.award")}</th>}<th scope="col" className="num">{say("trophies.col.seasons")}</th><th scope="col">{say("trophies.col.run")}</th></tr>}>
        {runs.map((s, i) => (
          <tr key={`${s.key}|${s.code}|${s.from}|${i}`}>
            <td className="team"><Winner r={{ person_id: s.person_id, franchise_id: s.franchise_id, winner: s.name, year: s.to }} look={look} league={s.league} /></td>
            {trophy ? null : <td><Link href={trophyPath(s.code)} prefetch={false}>{s.award}</Link></td>}
            <td className="num">{s.length}</td>
            <td>{s.from === s.to ? seasonLabel(s.league, s.from) : <><Link href={seasonPath(s.league, s.from)} prefetch={false}>{seasonLabel(s.league, s.from)}</Link>–{seasonLabel(s.league, s.to)}</>}</td>
          </tr>
        ))}
      </Board>,
    );
  }
  if (!trophy && parts.includes("seasons") && big.length) {
    out.push(
      <Board key="big" id="tb-big" title={say("trophies.bigSeasons")} note={say("trophies.bigSeasonsNote")}
        head={<tr><th scope="col">{say("trophies.col.who")}</th><th scope="col">{say("col.season")}</th><th scope="col" className="num">{say("trophies.col.awards")}</th><th scope="col">{say("col.award")}</th></tr>}>
        {big.slice(0, size).map((b) => (
          <tr key={`${b.person_id}|${b.league}|${b.year}`}>
            <td className="team"><Winner r={{ person_id: b.person_id, franchise_id: null, winner: b.name, year: b.year }} look={look} league={b.league} /></td>
            <td><Link href={seasonPath(b.league, b.year)} prefetch={false}>{leagueInfo(b.league)?.short ?? b.league.toUpperCase()} {seasonLabel(b.league, b.year)}</Link></td>
            <td className="num">{b.codes.length}</td>
            <td>{b.codes.map((c, j) => <span key={c}>{j ? ", " : ""}<Link href={trophyPath(c)} prefetch={false}>{b.awards[j]}</Link></span>)}</td>
          </tr>
        ))}
      </Board>,
    );
  }
  return <>{out}</>;
}
