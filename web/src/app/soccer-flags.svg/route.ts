import { soccerFlagFile } from "@/lib/soccerFlagFile";

// The rectangle flags of every national team in one file (components/SoccerFlag.tsx, shape "rect"). Kept an hour like the pages; no query is read.
export const revalidate = 3600;

export const GET = () => soccerFlagFile("rect");
