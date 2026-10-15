import { cupSvg } from "@/lib/cups";

/* No "use client": these are drawn on the server and ship no script. The markup is drawn by the dougu-sports package (lib/cups.ts), never from user input. */

/** A league's trophy as inline SVG. */
export function Trophy({ league, className }: { league: string; className: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: cupSvg(league) }} />;
}

/** The small decorative cup in the "Reigning champions" badge. */
export function BadgeCup({ league }: { league: string }) {
  return <span className="rcup" aria-hidden="true" dangerouslySetInnerHTML={{ __html: cupSvg(league) }} />;
}
