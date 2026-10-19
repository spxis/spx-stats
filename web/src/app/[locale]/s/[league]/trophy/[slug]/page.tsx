import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { AccentStyle } from "@/components/AccentStyle";
import { TrophyBoards, orderTrophies } from "@/components/TrophyBlocks";
import { TrophyWinners } from "@/components/TrophyWinners";
import { codeOfSlug, factsOf, trophiesPath, trophyHead, trophyLines, trophyPath, TROPHY_HEAD } from "@/lib/awardTrophy";
import { logoFor } from "@/lib/brand";
import { trophyArt, trophyBigSvg } from "@/lib/cups";
import { getBrands } from "@/lib/data";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { isLeague, leagueInfo, seasonLabel } from "@/lib/leagues";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { getPlayerPaths } from "@/lib/playerLinks";
import { seasonPath } from "@/lib/slug";
import { getLeagueTrophyRows, getTrophyList } from "@/lib/trophyData";
import "@/components/trophies.css";

export const revalidate = 86400;

// Nothing is drawn at build time: each address is drawn on its first visit, then kept and revalidated like the rest.
export const generateStaticParams = () => [];

type Props = PageProps<"/[locale]/s/[league]/trophy/[slug]">;

async function load(params: Props["params"]) {
  const { league, slug } = await params;
  const code = isLeague(league) ? codeOfSlug(league, slug) : null;
  if (!code) return null;
  const list = await getTrophyList();
  const info = list.find((t) => t.code === code);
  if (!info) return null;
  const rows = (await getLeagueTrophyRows(league)).filter((r) => r.award_code === code);
  return { league, info, rows, list };
}

/** One trophy: its drawing, what it honours, when it was first given, who won it each season (a person or a team, linked), who won it most and its longest runs. */
export const generateMetadata = guardMeta(async ({ params }: Props): Promise<Metadata> => {
  const got = await load(params);
  if (!got) return {};
  const { say, plural, locale } = await currentSpeaker();
  const lg = leagueInfo(got.league)!;
  const facts = factsOf(got.rows);
  const first = facts.first != null ? say("trophies.firstAwarded", { season: seasonLabel(got.league, facts.first) }) : "";
  return pageMeta({
    title: `${got.info.name} · ${lg.short}`,
    description: [got.info.description, first, plural("count.winners", facts.given)].filter(Boolean).join(" "),
    path: trophyPath(got.info.code), locale,
  });
});

export default guard(async function TrophyPage({ params }: Props) {
  const got = await load(params);
  if (!got) notFound();
  const { league: lg, info, rows, list } = got;
  const league = leagueInfo(lg)!;
  const { say, plural } = await currentSpeaker();
  const [brands, player] = await Promise.all([getBrands(), getPlayerPaths()]);
  const art = trophyArt(info.code, info.kind);
  const facts = factsOf(rows);
  const all = trophyLines(rows, { player: (id, name) => player(id, name, lg), logo: (f, y) => logoFor(brands, f, y) });
  const head = trophyHead(all, TROPHY_HEAD);
  const team = info.kind !== "person_award";
  const others = orderTrophies(list.filter((t) => t.league === lg && t.code !== info.code));
  const holder = rows.length ? rows.filter((r) => r.year === facts.last) : [];
  return (
    <>
      <AccentStyle league={lg as Parameters<typeof AccentStyle>[0]["league"]} />
      <section className="head fade">
        <span className="eyebrow"><Link href={`/${lg}`}>{league.short}</Link> · <Link href={trophiesPath(lg)}>{say("trophies.leagueTitle", { league: league.short })}</Link></span>
        <h1>{info.name}</h1>
        {info.description ? <p className="lede">{info.description}</p> : null}
        <div className="trophyhero">
          <figure className="bigtrophy" role="img" aria-label={info.name} dangerouslySetInnerHTML={{ __html: trophyBigSvg(art, info.name) }} />
          <dl className="trophyfacts" aria-label={say("trophies.facts")}>
            <div><dt>{say("trophies.factKind")}</dt><dd>{say(`trophies.kind.${info.kind}` as "trophies.kind.person_award")}</dd></div>
            {facts.first != null ? <div><dt>{say("trophies.factFirst")}</dt><dd><Link href={seasonPath(lg, facts.first)} prefetch={false}>{seasonLabel(lg, facts.first)}</Link></dd></div> : null}
            {facts.last != null ? <div><dt>{say("trophies.factLast")}</dt><dd>{seasonLabel(lg, facts.last)}{holder.length === 1 && holder[0].winner ? <span className="note"> · {holder[0].winner}</span> : null}</dd></div> : null}
            {facts.given ? <div><dt>{say("trophies.factGiven")}</dt><dd>{plural("count.winners", facts.given)}</dd></div> : null}
          </dl>
        </div>
        {art.named ? null : <p className="note">{say("trophies.standIn")}</p>}
      </section>
      <section className="section" aria-labelledby="tw-title">
        <h2 id="tw-title">{say("trophies.winnersTitle")}</h2>
        {all.lines.length ? (
          <>
            <p className="note">{say("trophies.winnersNote", { winners: plural("count.winners", all.lines.length) })}</p>
            <div className="tablebox">
              <TrophyWinners lg={lg} code={info.code} team={team} hasTeam={all.lines.some((l) => l.t)} hasNote={all.lines.some((l) => l.n)} head={head.lines} logos={head.logos} total={all.lines.length} />
            </div>
          </>
        ) : <p className="note">{say("trophies.noWinners")}</p>}
      </section>
      <TrophyBoards rows={rows} trophy={info} />
      {others.length ? (
        <section className="section" aria-labelledby="tw-others">
          <h2 id="tw-others">{say("trophies.otherOf", { league: league.short })}</h2>
          <ul className="trophychips">
            {others.map((t) => <li key={t.code}><Link href={trophyPath(t.code)} prefetch={false}>{t.name}</Link></li>)}
          </ul>
          <p className="note"><Link href={trophiesPath(lg)}>{say("trophies.back", { league: league.short })}</Link></p>
        </section>
      ) : null}
    </>
  );
});
