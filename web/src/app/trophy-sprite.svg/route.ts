import { trophySpriteFile } from "@/lib/trophySprite";

// The drawings of every trophy in one file (components/TrophyBlocks.tsx, the all-leagues trophies page). Kept a day like the pages; no query is read.
export const revalidate = 86400;

export const GET = () => trophySpriteFile();
