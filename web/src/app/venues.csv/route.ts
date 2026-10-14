import { venuesCsv } from "@/lib/venueDataset";
import { getVenueRecords } from "@/lib/venueData";

// The open dataset of venues as CSV, complete (home, spring and future rows, told apart by the kind column; GET /api/venues defaults to home only) (columns, licence and credit: /sources). Kept an hour like the pages; no query is read, so it is built once and served from the cache.
export const revalidate = 3600;

export async function GET() {
  try {
    return new Response(venuesCsv(await getVenueRecords()), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="spxn-venues.csv"', "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(e);
    return new Response("The archive could not be read. Try again shortly.\n", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}
