import type { BoardData, GroupView, RefIndex } from "@/lib/playerBoard";
import type { PlayerState } from "@/lib/playerRange";

/** What every part of the player board draws from: the page's data, the reader's choices, and the figures cut to them. */
export interface BoardView {
  data: BoardData;
  state: PlayerState;
  refs: RefIndex;
  groups: GroupView[];
  /** Move the range (a table row, a chart): the page keeps it in the address and remembers it. */
  setSpan: (from: number, to: number) => void;
}
