import { soccerFlagFile } from "@/lib/soccerFlagFile";

// The rectangle flags of every national team in one file (components/SoccerFlag.tsx, shape "rect"). Kept a day like the pages; no query is read.
export const revalidate = 86400;

export const GET = () => soccerFlagFile("rect");
