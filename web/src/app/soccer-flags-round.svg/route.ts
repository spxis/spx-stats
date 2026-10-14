import { soccerFlagFile } from "@/lib/soccerFlagFile";

// The round flags of every national team in one file (components/SoccerFlag.tsx, shape "round", the one the World Cup pages draw). Kept a day like the pages; no query is read.
export const revalidate = 86400;

export const GET = () => soccerFlagFile("round");
