import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SoccerCredit } from "@/components/SoccerCredit";
import { SoccerTeamName } from "@/components/SoccerTeamName";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getMatch, getMatchDetail, tournamentOfYear, type Card, type Goal, type Lineup, type Match } from "@/lib/soccer";
import { teamName } from "@/lib/soccerNames";
import { isYearSeg, soccerMatchIdOf, soccerMatchPath, soccerPlayerPath, soccerTeamPath, tournamentPath } from "@/lib/soccerPath";
import { groupLabel, scoreLines, stageName } from "@/lib/soccerView";
import "@/components/soccer.css";

export const revalidate = 3600;

// Nothing is drawn at build time: each match is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Params = PageProps<"/[locale]/s/worldcup/[year]/match/[match]">;

async function find(year: string, seg: string): Promise<Match | null> {
  const id = isYearSeg(year) ? soccerMatchIdOf(seg) : null;
  const m = id == null ? null : await getMatch(id);
  return m && String(m.year) === year ? m : null;
}

export const generateMetadata = guardMeta(async ({ params }: Params): Promise<Metadata> => {
  const { year, match } = await params;
  const m = await find(year, match);
  if (!m) return {};
  const { say, locale } = await currentSpeaker();
  const home = teamName({ name: m.home, slug: m.home_slug, flag: m.home_flag }, locale);
  const away = teamName({ name: m.away, slug: m.away_slug, flag: m.away_flag }, locale);
  const title = `${home} ${m.home_goals}–${m.away_goals} ${away}`;
  return pageMeta({
    title,
    description: say("wc.m.metaDesc", { title, stage: groupLabel(say, m), year: m.year }),
    path: soccerMatchPath(m.year, m.match_id, m.home, m.away),
    locale,
  });
});

export default guard(async function MatchPage({ params }: Params) {
  const { year, match } = await params;
  const m = await find(year, match);
  if (!m) notFound();
  const canonical = soccerMatchPath(m.year, m.match_id, m.home, m.away);
  if (`/worldcup/${year}/match/${match}` !== canonical) permanentRedirect(canonical);
  const { say, dt, locale } = await currentSpeaker();
  const [t, d] = await Promise.all([tournamentOfYear(m.year), getMatchDetail(m.match_id)]);
  const s = scoreLines(say, m);
  const title = say(m.league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year: m.year });
  const sides = [
    { id: m.home_team_id, name: m.home, slug: m.home_slug, flag: m.home_flag },
    { id: m.away_team_id, name: m.away, slug: m.away_slug, flag: m.away_flag },
  ];
  const referees = d.staff.filter((x) => x.role === "referee");
  const managers = d.staff.filter((x) => x.role === "manager");
  // A stadium is shown as the source names it. When the world stadium dataset is live, m.venue_wikidata_id links the name to /venue/Q<id>,
  // which redirects to the venue's own page; until that route exists the name is plain text (and the link would 404 for an id not yet in the dataset).
  const venue = [m.venue_name, m.venue_city, m.venue_country].filter(Boolean).join(", ");
  const kickoff = m.kickoff_local ? m.kickoff_local.slice(0, 5) : null;
  const teamOf = (id: string) => { const sd = sides.find((x) => x.id === id); return sd ? teamName({ name: sd.name, slug: sd.slug, flag: sd.flag }, locale) : ""; };
  const cardsOf = (personId: number) => d.cards.filter((c) => c.person_id === personId);

  return (
    <div className="soccer">
      <section className="head fade">
        <span className="eyebrow"><Link href={tournamentPath(m.year)}>{title}</Link> · {groupLabel(say, m)}</span>
        <h1>{teamName({ name: m.home, slug: m.home_slug, flag: m.home_flag }, locale)} – {teamName({ name: m.away, slug: m.away_slug, flag: m.away_flag }, locale)}</h1>
        <p className="lede">
          {dt.full(new Date(m.match_date))}{kickoff ? ` · ${kickoff}${m.utc_offset ? ` (UTC${m.utc_offset})` : ""}` : ""}{venue ? ` · ${venue}` : ""}
        </p>
      </section>
      <section className="sc-board" aria-label={say("wc.m.result")}>
        <div className="side">
          <span className="nm"><SoccerTeamName slug={sides[0].slug} name={sides[0].name} flag={sides[0].flag} /></span>
        </div>
        <div className="mid">
          <div className="big">{s.main}</div>
          {s.note ? <div className="sub">{s.note}</div> : null}
          {m.extra_time && m.home_goals_90 != null && m.away_goals_90 != null ? <div className="sub">{say("wc.m.after90", { home: m.home_goals_90, away: m.away_goals_90 })}</div> : null}
        </div>
        <div className="side away">
          <span className="nm"><SoccerTeamName slug={sides[1].slug} name={sides[1].name} flag={sides[1].flag} /></span>
        </div>
      </section>
      {m.checked === 1 ? <p className="note">{say("wc.m.confirmed")}</p> : null}
      {m.is_replay ? <p className="note">{say("wc.m.replay")}</p> : null}

      <section className="section">
        <h2>{say("wc.m.goals")}</h2>
        {d.goals.length ? <GoalList goals={d.goals} home={m.home_team_id} say={say} /> : <p className="note">{m.home_goals + m.away_goals ? say("wc.m.noGoalDetail") : say("wc.m.noGoals")}</p>}
      </section>

      {d.kicks.length ? (
        <section className="section">
          <h2>{say("wc.m.shootout")}</h2>
          <div className="sc-two">
            {sides.map((sd) => (
              <div key={sd.id}>
                <h3>{teamName({ name: sd.name, slug: sd.slug, flag: sd.flag }, locale)}</h3>
                <p className="sc-kicks">
                  {d.kicks.filter((k) => k.team_id === sd.id).map((k) => (
                    <span key={k.kick_id} className={k.converted ? "ok" : "miss"}>
                      <Link href={soccerPlayerPath(k.person_id, k.player)} prefetch={false}>{k.player}</Link> {k.converted ? "✓" : "✗"}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {d.cards.length ? (
        <section className="section">
          <h2>{say("wc.m.cards")}</h2>
          <ul className="sc-events">
            {d.cards.map((c) => (
              <li key={c.booking_id}>
                <span className="min">{c.minute_label}</span>
                <span><CardMark c={c} say={say} /> <Link href={soccerPlayerPath(c.person_id, c.player)} prefetch={false}>{c.player}</Link>{" "}
                  <span className="note">({teamOf(c.team_id)})</span></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section">
        <h2>{say("wc.m.lineups")}</h2>
        {d.lineups.length ? (
          <div className="sc-two">
            {sides.map((sd) => (
              <div key={sd.id}>
                <h3><SoccerTeamName slug={sd.slug} name={sd.name} flag={sd.flag} /></h3>
                <Lineups rows={d.lineups.filter((l) => l.team_id === sd.id)} cards={cardsOf} say={say} />
                {managers.filter((x) => x.team_id === sd.id).map((x) => (
                  <p className="note" key={x.person_id}>{say("wc.m.manager")}: {x.name}</p>
                ))}
              </div>
            ))}
          </div>
        ) : <p className="note">{say("wc.m.noLineups")}</p>}
      </section>

      {referees.length ? (
        <section className="section">
          <h2>{say("wc.m.officials")}</h2>
          <p>{referees.map((r) => r.name).join(", ")}{referees[0].country ? ` (${referees[0].country})` : ""}</p>
        </section>
      ) : null}
      <section className="section">
        <p className="note">
          <Link href={tournamentPath(m.year)}>{title}</Link> · <Link href={soccerTeamPath(m.home_slug)}>{teamName({ name: m.home, slug: m.home_slug, flag: m.home_flag }, locale)}</Link> · <Link href={soccerTeamPath(m.away_slug)}>{teamName({ name: m.away, slug: m.away_slug, flag: m.away_flag }, locale)}</Link>
          {t ? <> · {stageName(say, m.stage_key)}</> : null}
        </p>
        <SoccerCredit say={say} />
      </section>
    </div>
  );
});

function CardMark({ c, say }: { c: Card; say: (k: "wc.m.yellow" | "wc.m.red" | "wc.m.secondYellow") => string }) {
  if (c.second_yellow) return <><span className="sc-card-y" /><span className="sc-card-r" title={say("wc.m.secondYellow")} /></>;
  if (c.red_card || c.sending_off) return <span className="sc-card-r" title={say("wc.m.red")} />;
  return <span className="sc-card-y" title={say("wc.m.yellow")} />;
}

function GoalList({ goals, home, say }: { goals: Goal[]; home: string; say: (k: "wc.m.pen" | "wc.m.og") => string }) {
  return (
    <ul className="sc-events">
      {goals.map((g, i) => (
        <li key={i} className={g.team_id === home ? "home" : "away"}>
          <span className="min">{g.minute_label}</span>
          <span>
            <SoccerTeamName slug={g.team_slug} name={g.team} flag={g.flag_code} link={false} />{" "}
            {g.person_id != null ? <Link href={soccerPlayerPath(g.person_id, g.scorer_name)} prefetch={false}>{g.scorer_name}</Link> : g.scorer_name}
            {g.penalty ? ` (${say("wc.m.pen")})` : ""}{g.own_goal ? ` (${say("wc.m.og")})` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Lineups({ rows, cards, say }: { rows: Lineup[]; cards: (personId: number) => Card[]; say: (k: "wc.m.subOn" | "wc.m.subOff" | "wc.m.bench") => string }) {
  const starters = rows.filter((r) => r.starter);
  const bench = rows.filter((r) => !r.starter);
  const line = (r: Lineup, isBench: boolean) => (
    <li key={r.person_id} className={isBench ? "bench" : undefined}>
      <span className="no">{r.shirt_number ?? ""}</span>
      <span className="pos">{r.position_code ?? ""}</span>
      <span>
        <Link href={soccerPlayerPath(r.person_id, r.player)} prefetch={false}>{r.player}</Link>{" "}
        {cards(r.person_id).map((c) => <span key={c.booking_id} className={c.red_card || c.sending_off ? "sc-card-r" : "sc-card-y"} />)}
      </span>
      <span className="tag">
        {r.off_at ? `${say("wc.m.subOff")} ${r.off_at}` : ""}{r.on_at ? `${say("wc.m.subOn")} ${r.on_at}` : ""}
      </span>
    </li>
  );
  const used = bench.filter((r) => r.on_at);
  const unused = bench.filter((r) => !r.on_at);
  return (
    <>
      <ul className="sc-lineup">{starters.map((r) => line(r, false))}</ul>
      {used.length || unused.length ? <ul className="sc-lineup"><li className="bench"><span /><span /><span className="note">{say("wc.m.bench")}</span><span /></li>{used.map((r) => line(r, true))}{unused.map((r) => line(r, true))}</ul> : null}
    </>
  );
}
