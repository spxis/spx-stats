import { SoccerFlag } from "@/components/SoccerFlag";

/**
 * The mark in a match banner's circle (components/Showdown.tsx): a national team's round flag at the banner's size, else, for a team the archive holds no
 * flag for (the Soviet Union, Czechoslovakia, Yugoslavia, the two Germanys...), its three-letter code as a monogram, as a club without a logo has on a
 * series page. Never an emblem or crest.
 */
export function SoccerCrest({ code, name, abbr }: { code: string | null | undefined; name: string; abbr: string }) {
  return code
    ? <span className="crest flagcrest"><SoccerFlag code={code} name={name} hero /></span>
    : <span className="crest"><span className="mono">{abbr}</span></span>;
}
