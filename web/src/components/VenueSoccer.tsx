import Link from "@/components/Link";
import type { Speaker } from "@/lib/i18n/i18n";
import { mlsClubPath, mlsMatchPath, mlsSeasonPath } from "@/lib/mlsPath";
import { mlsStageName } from "@/lib/mlsView";
import { soccerMatchPath, tournamentPath } from "@/lib/soccerPath";
import { teamName } from "@/lib/soccerNames";
import { scoreLines, stageName } from "@/lib/soccerView";
import type { PitchDrawing } from "@/lib/venueDraw";
import type { Edition, SoccerGames, VenueMatch } from "@/lib/venueSoccerGames";
import { citedTitle, type Pitch } from "@/lib/venueSoccerRows";

/**
 * What a world soccer stadium page adds to a venue's page: the World Cups played there (rounds, the final first, every match linked to its page), the MLS clubs that
 * played at home there with their years, the MLS Cup finals held there, and the pitch drawn at its published size. Server components: no script. The match and
 * tournament addresses are the soccer pages' own (lib/soccerPath.ts, lib/mlsPath.ts).
 */

type Say = Speaker["say"];

const wcName = (say: Say, e: Pick<Edition, "lg" | "year">) => say(e.lg === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: e.year });

/** "Argentina 3–3 France (4–2 on penalties)": a match as a line, the teams in the reader's language for the national teams. */
function matchLine(m: VenueMatch, say: Say, locale: Speaker["locale"]): string {
  const national = m.league !== "mls";
  const home = national ? teamName({ name: m.home, slug: m.home_slug, flag: m.home_flag }, locale) : m.home;
  const away = national ? teamName({ name: m.away, slug: m.away_slug, flag: m.away_flag }, locale) : m.away;
  const s = scoreLines(say, { home_goals: m.home_goals, away_goals: m.away_goals, extra_time: m.extra_time, shootout: m.shootout, home_penalties: m.home_penalties, away_penalties: m.away_penalties });
  return `${home} ${s.main} ${away}${s.note ? ` (${s.note})` : ""}`;
}

const matchHref = (m: VenueMatch) => (m.league === "mls" ? mlsMatchPath(m.year, m.match_id, m.home, m.away) : soccerMatchPath(m.year, m.match_id, m.home, m.away));

function MatchItem({ m, say, locale }: { m: VenueMatch; say: Say; locale: Speaker["locale"] }) {
  const stage = m.league === "mls" ? mlsStageName(say, m.stage_key) : m.group_name && m.stage_key.includes("group") ? say("wc.group", { name: m.group_name.replace(/^Group\s+/, "") }) : stageName(say, m.stage_key);
  return (
    <li className={m.stage_key === "final" ? "venuefinal" : undefined}>
      <span>{m.match_date}</span>
      <span>{stage}</span>
      <Link href={matchHref(m)} prefetch={false}>{matchLine(m, say, locale)}</Link>
    </li>
  );
}

function EditionBlock({ e, say, plural, locale }: { e: Edition; say: Say; plural: Speaker["plural"]; locale: Speaker["locale"] }) {
  const rounds = e.rounds.map((r) => `${stageName(say, r.stage)} ${r.matches}`).join(" · ");
  return (
    <div className="venueedition">
      <h3><Link href={tournamentPath(e.year)} prefetch={false}>{wcName(say, e)}</Link></h3>
      <p className="note">{plural("count.matches", e.matches.length)}: {rounds}</p>
      {e.final ? <p className="venuefinalline"><b>{say("venue.finalHere")}</b>{" "}<Link href={matchHref(e.final)} prefetch={false}>{matchLine(e.final, say, locale)}</Link></p> : null}
      <details className="venueseasons">
        <summary>{say("venue.matchesList")}</summary>
        <ul className="venuefinals">{e.matches.map((m) => <MatchItem key={m.match_id} m={m} say={say} locale={locale} />)}</ul>
      </details>
    </div>
  );
}

/** The World Cups and the MLS played at a stadium. Renders nothing for a stadium with no match on record. */
export function SoccerHere({ games, say, plural, fmt, locale }: { games: SoccerGames; say: Say; plural: Speaker["plural"]; fmt: Speaker["fmt"]; locale: Speaker["locale"] }) {
  const { editions, mls } = games;
  if (!editions.length && !mls) return null;
  const first = mls ? Math.min(...mls.tenants.map((t) => t.from), ...mls.finals.map((m) => m.year)) : 0;
  const last = mls ? Math.max(...mls.tenants.map((t) => t.to), ...mls.finals.map((m) => m.year)) : 0;
  return (
    <>
      {editions.length ? (
        <section className="section">
          <h2>{say("venue.wcHead")}</h2>
          {editions.map((e) => <EditionBlock key={`${e.lg}${e.year}`} e={e} say={say} plural={plural} locale={locale} />)}
          <p className="note">{say("venue.wcNote")}</p>
        </section>
      ) : null}
      {mls ? (
        <section className="section">
          <h2>{say("venue.mlsHead")}</h2>
          <p className="note">{say("venue.mlsLede", { matches: plural("count.matches", mls.matches), seasons: plural("count.seasons", mls.seasons), playoffs: fmt(mls.playoffs) })}</p>
          {mls.tenants.length ? (
            <>
              <h3>{say("venue.mlsClubs")}</h3>
              <ul className="venuenameslist">
                {mls.tenants.map((t) => (
                  <li key={t.id}>
                    <b><Link href={mlsClubPath(t.slug)} prefetch={false}>{t.name}</Link></b>
                    <span>{t.from === t.to ? t.from : `${t.from}–${t.to}`}</span>
                    <span>{plural("count.matches", t.matches)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {mls.finals.length ? (
            <>
              <h3>{say("venue.mlsFinals")}</h3>
              <ul className="venuefinals">
                {mls.finals.map((m) => (
                  <li key={m.match_id} className="venuefinal">
                    <Link href={mlsSeasonPath(m.year)} prefetch={false}>{m.year}</Link>
                    <span>{mlsStageName(say, m.stage_key)}</span>
                    <Link href={matchHref(m)} prefetch={false}>{matchLine(m, say, locale)}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="note">{say("venue.mlsNote", { first: String(first), last: String(last) })}</p>
        </section>
      ) : null}
    </>
  );
}

/** The article and revision a pitch size was read from, as a link to that revision of the English Wikipedia article. */
function citeLink(cite: string): { title: string; href: string } | null {
  const title = citedTitle(cite);
  const rev = /@(\d+)$/.exec(cite)?.[1];
  return title && rev ? { title, href: `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, "_"))}&oldid=${rev}` } : null;
}

/** The pitch drawn to scale, with the size it is drawn at and where the size comes from. */
export function PitchFigure({ pitch, drawing, say }: { pitch: Pitch; drawing: PitchDrawing; say: Say }) {
  const cite = pitch.cite ? citeLink(pitch.cite) : null;
  const size = { length: String(pitch.length), width: String(pitch.width) };
  return (
    <section className="section">
      <h2>{say("venue.pitchHead")}</h2>
      <figure className="venuesurface venuepitch">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG file, not a photo: next/image has nothing to resize */}
        <img src={drawing.src} alt={drawing.alt} width={drawing.width} height={drawing.height} loading="lazy" decoding="async" />
        <figcaption className="note">
          {pitch.source === "published" ? say("venue.pitchPublished", size) : say("venue.pitchStandard")}
          {cite ? <>{" "}{say("venue.pitchSource")}{" "}<a className="ext" href={cite.href} target="_blank" rel="noopener noreferrer">{cite.title}</a></> : null}
        </figcaption>
      </figure>
    </section>
  );
}
