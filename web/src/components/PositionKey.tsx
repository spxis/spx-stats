import type { ReactNode } from "react";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG } from "@/lib/leagues";
import { getPositions } from "@/lib/positionData";
import { keyGroups, positionCodes, positionName, POSITIONS_KEY_ID, resolveLeague, type KeyGroup, type PositionUse } from "@/lib/positions";
import { PositionList } from "./PositionCode";
import "./positions.css";

/** The league's short name in a key's heading; a league the site has no short name for (soccer) is written as its code. */
const leagueTitle = (l: string): string => (l in LG ? LG[l as keyof typeof LG] : l === "soccer" ? "Soccer" : l.toUpperCase());

/** The key itself: nothing for no groups; one league's codes without a heading; several leagues each under their own. */
export function PositionKey({ groups, title, note }: { groups: readonly KeyGroup[]; title: string; note: string }) {
  if (!groups.length) return null;
  return (
    <section className="section poskey" id={POSITIONS_KEY_ID}>
      <h2>{title}</h2>
      <p className="note">{note}</p>
      {groups.map((g) => (
        <div key={g.league}>
          {groups.length > 1 ? <h3>{leagueTitle(g.league)}</h3> : null}
          <dl>
            {g.items.map((x) => (
              <div className="poskey-row" key={x.code}><dt>{x.code}</dt><dd>{x.name}</dd></div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

/** What a page draws its positions through; see positionBook. */
export type PositionBook = Awaited<ReturnType<typeof positionBook>>;

/**
 * A page's positions, collected on the server as the page draws them: `list`/`code` draw positions and note which codes were drawn,
 * `key()` then draws the key of exactly those (call it after the cells, it reads what was noted). One cached read of api.position per request;
 * with no list (the view missing or unreadable) the codes show bare and no key is drawn.
 */
export async function positionBook() {
  const [list, { say, locale }] = await Promise.all([getPositions(), currentSpeaker()]);
  const uses: PositionUse[] = [];
  const read = (code: string, leagues: readonly string[]) => {
    const league = resolveLeague(code, leagues, list);
    if (league) uses.push({ league, code });
    return { code, name: league ? positionName(code, league, list, locale) : null };
  };
  return {
    /** A person's positions (the list, else the main one) as linked codes; `leagues` are the leagues to read the codes in, the page's own first. */
    list(positions: readonly string[] | null | undefined, main: string | null | undefined, leagues: readonly string[], full?: boolean): ReactNode {
      return <PositionList items={positionCodes(positions, main).map((c) => read(c, leagues))} full={full} />;
    },
    /** A person's position codes with their names, for a table drawn in the browser (components/PositionCode's PositionList); notes the codes for the key. */
    items(positions: readonly string[] | null | undefined, main: string | null | undefined, leagues: readonly string[]): { code: string; name: string | null }[] {
      return positionCodes(positions, main).map((c) => read(c, leagues));
    },
    /** One bare code (a lineup's, a filter's) as a linked code. */
    code(code: string | null | undefined, leagues: readonly string[]): ReactNode {
      return code ? <PositionList items={[read(code.trim().toUpperCase(), leagues)]} /> : null;
    },
    /** The name of a code in the reader's language (for a title attribute where a link cannot go); notes the code for the key. */
    name(code: string, leagues: readonly string[]): string | undefined {
      return read(code, leagues).name ?? undefined;
    },
    /** Notes codes for the key without drawing them (a page whose cells were drawn elsewhere). */
    note(positions: readonly string[] | null | undefined, main: string | null | undefined, leagues: readonly string[]): void {
      for (const c of positionCodes(positions, main)) read(c, leagues);
    },
    /** The key of every code drawn so far. */
    key(): ReactNode {
      return <PositionKey groups={keyGroups(uses, list, locale)} title={say("poskey.title")} note={say("poskey.note")} />;
    },
  };
}
