import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { RoadArt } from "./RoadArt";
import "./knockout.css";

/** One of a bracket's two drawings as a file: its address and its shape (width over height). */
export interface KnockoutSource { src: string; ratio: number }

/**
 * A knockout bracket as Taisen Brackets draws it, loaded as two SVG files instead of carried in the page (the same two drawings as components/Knockout.tsx, the
 * desk's and the phone's, one shown by the stylesheet at each width). The server writes the SVG strings into a page's HTML and Next sends them again as data, so
 * a season's bracket and play-in were 300 KB of a 700 KB page; here the page holds two empty boxes of the drawings' shape and each file is fetched once, when
 * its box comes into view (RoadArt; a box the stylesheet hides never does), then kept by the browser and the CDN. The files are the drawings themselves, written into the page,
 * so they take its colours and every box still links to its series or match. Without script the page says where the file is (the rounds' links under the bracket
 * lead to every series too).
 */
export async function KnockoutFile({ wide, phone }: { wide: KnockoutSource; phone: KnockoutSource }) {
  const { say } = await currentSpeaker();
  return (
    <div className="kobracket">
      <div className="ko-wide"><RoadArt src={wide.src} ratio={wide.ratio} links /></div>
      <div className="ko-phone"><RoadArt src={phone.src} ratio={phone.ratio} links /></div>
      <noscript><p className="note"><a href={wide.src}>{say("playoffs.file")}</a></p></noscript>
    </div>
  );
}
