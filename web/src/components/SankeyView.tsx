"use client";

import { useSpeaker } from "./i18n/LocaleProvider";
import type { SankeyLinkIn, SankeyNodeIn, SankeyRoute } from "./Sankey";
import { SankeyLazy } from "./SankeyLazy";

interface Props {
  nodes: SankeyNodeIn[];
  links: SankeyLinkIn[];
  routes?: SankeyRoute[];
  columnTitles: string[];
  hint: string;
  aria: string;
  unitPx?: number;
  minPitch?: number;
  /** Details with lists of links go in a panel under the diagram. */
  panel?: boolean;
}

/**
 * A Sankey diagram whose blocks, bands and words were all made on the server. The diagram's "Open {title}" link text needs a function,
 * which a server component cannot hand to a client one, so it is made here.
 */
export function SankeyView({ hint, aria, ...rest }: Props) {
  const { say } = useSpeaker();
  return <SankeyLazy {...rest} labels={{ hint, aria, open: (title) => say("sankey.open", { title }) }} />;
}
