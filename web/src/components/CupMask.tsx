import { cupMask } from "@/lib/cups";

/** The league's line cup, once, as the mask of every `.cupped` cell of a table under it (components/AwardsGrid.tsx); the rules for it are in people.css. */
export function CupMask({ league }: { league: string }) {
  return <style>{`.awardsgrid{--cup:${cupMask(league)}}`}</style>;
}
