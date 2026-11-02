import { historyDay } from "@/lib/todayHistory/day";

// "Today in history" for a league and a calendar day (/nhl/rows/today/11-02): the calendar page and up to three facts, as JSON. The block on the league page
// (components/TodayInHistory.tsx) asks for the reader's own day, worked out in the browser. The facts are a file in the source (lib/todayHistory/data), so the answer
// reads no database and is the same all year: drawn on its first request, then kept for a month (a day with nothing answers `{"day":null}`, also kept). Only the
// calendar page's month word depends on the language. No query is read.
export const revalidate = 2592000;
export const dynamicParams = true;
export const generateStaticParams = () => [];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; league: string; day: string }> }) {
  const { locale, league, day } = await params;
  return new Response(JSON.stringify({ day: historyDay(league, day, locale) }), { headers: JSON_HEADERS });
}
