import { medalSvg } from "@/lib/medals";

/** A gold, silver or bronze medal for a first, second or third place, beside the text that names the place (so it is hidden from screen readers). A server component: the medal markup never reaches the browser bundle. */
export function PlaceMedal({ place }: { place: number }) {
  return <span className="placemedal" aria-hidden="true" dangerouslySetInnerHTML={{ __html: medalSvg(place) }} />;
}
