import { venuesGeoJson } from "@/lib/venueDataset";
import { getVenueRecords } from "@/lib/venueData";

// The open dataset of venues as GeoJSON, complete (every kind, with a kind property; GET /api/venues defaults to home only) (RFC 7946, [longitude, latitude]); name, licence, attribution and sources are top-level members. Kept a day; no query is read.
export const revalidate = 86400;

export async function GET() {
  try {
    return new Response(JSON.stringify(venuesGeoJson(await getVenueRecords(), new Date())), {
      headers: { "Content-Type": "application/geo+json; charset=utf-8", "Content-Disposition": 'inline; filename="spxn-venues.geojson"', "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error(e);
    return new Response("The archive could not be read. Try again shortly.\n", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "2", "Cache-Control": "no-store" } });
  }
}
