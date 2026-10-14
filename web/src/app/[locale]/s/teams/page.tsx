import type { Metadata } from "next";
import Link from "next/link";
import { PageFlagSprite } from "@/components/PageFlagSprite";
import { TeamsBoard } from "@/components/TeamsBoard";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard, guardMeta } from "@/lib/loadGuard";
import { pageMeta } from "@/lib/meta";
import { countryName } from "@/lib/people-format";
import { getTeamBoard } from "@/lib/teamBoardData";
import "@/components/alignment.css";

// A kept page: the league, search, status, years, conference and division, least titles, sort and page are all chosen and applied in the browser from the one
// list this page is drawn with (lib/teamBoard.ts), so the address never carries a query this page reads on the server (lib/routing.ts: ALWAYS_STATIC).

export const generateMetadata = guardMeta(async (): Promise<Metadata> => {
  const { say, locale } = await currentSpeaker();
  return pageMeta({ title: say("teams.title"), description: say("teams.metaDesc"), path: "/teams", locale });
});

export default guard(async function TeamsPage() {
  const { say, locale } = await currentSpeaker();
  const data = await getTeamBoard(locale === "fr").catch(() => null);
  const head = (
    <>
      <h1>{say("teams.title")}</h1>
      <p className="lede">{say("teams.lede")}</p>
      <p className="note"><Link href="/teams/lineage" prefetch={false}>{say("lineage.link")}</Link> · <Link href="/teams/coaches" prefetch={false}>{say("coaches.link")}</Link></p>
    </>
  );
  if (!data) return <><section className="head fade">{head}</section><section className="section"><p className="note">{say("load.failed")}</p></section></>;
  const codes = [...new Set(data.teams.flatMap((t) => (t.cc ? [t.cc] : [])))];
  const countries = Object.fromEntries(codes.map((c) => [c, countryName(c, locale)]));
  return (
    <>
      <PageFlagSprite codes={codes} />
      <TeamsBoard teams={data.teams} logos={data.logos} groups={data.groups} countries={countries} head={head} />
    </>
  );
});
