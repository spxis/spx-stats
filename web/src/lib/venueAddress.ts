import { formatAddress, getProvinceFromPostalCode, getStateFromZip, parseLocation, validatePostalCode } from "@johnmorrisdotca/address-plus";

/** The parts of a venue's address that the archive holds; any of them can be missing. */
export interface VenueAddressParts {
  /** The street line as Wikidata gives it ("10220 104 Ave NW"). */
  street?: string | null;
  city?: string | null;
  /** The state or province abbreviation ("AB", "WA"). */
  region?: string | null;
  /** A postal or ZIP code, only when a source gave one. The archive holds none today, and one is never worked out from the rest. */
  postal?: string | null;
  /** The ISO country code ("CA", "US"). */
  countryCode?: string | null;
  /** The country's name in the reader's language. */
  country?: string | null;
}

/** A venue's address as lines (street, city and region with the code, country) and as one line. */
export interface VenueAddress { lines: string[]; text: string }

/** Wikidata addresses now and then carry wiki markup after the street ("500 David J. Stern Walk<ref>{{Cite web …"): keep what comes before it. */
function tidy(s: string | null | undefined): string {
  return (s ?? "").split(/<|\{\{|\[\[/)[0].replace(/\s+/g, " ").trim().replace(/[,;]+$/, "");
}

/** "Washington, D.C." is the city and DC the region: write the city once. */
function cityName(s: string | null | undefined): string {
  return tidy(s).replace(/,\s*D\.?C\.?$/i, "");
}

/** A postal or ZIP code in the standard way, or "" when address-plus does not accept its shape or it belongs to another state or province than the one given. */
function goodPostal(postal: string, region: string): string {
  if (!postal) return "";
  const v = validatePostalCode(postal);
  if (!v.isValid || !v.formatted) return "";
  const belongs = v.type === "zip" ? getStateFromZip(v.formatted) : getProvinceFromPostalCode(v.formatted);
  return !region || !belongs || belongs === region.toUpperCase() ? v.formatted : "";
}

/** address-plus sets "SW" in "3700 SW Freeway" as a name ("Sw"): an all-capitals word of up to three letters in the source keeps its capitals. */
function keepInitialisms(line: string, source: string): string {
  const caps = new Map(source.split(" ").filter((w) => /^[A-Z]{2,3}$/.test(w)).map((w) => [w.toLowerCase(), w]));
  return line.split(" ").map((w) => caps.get(w.toLowerCase()) ?? w).join(" ");
}

/**
 * One address in one format wherever the site shows a venue: the street line as address-plus writes it (street types and
 * directions abbreviated its way), then the city, region and code, then the country. Canada's last line is Canada Post's
 * ("Edmonton AB T5J 0H6"), everywhere else the usual comma form ("Seattle, WA 98134"). The postal code appears only when it
 * was given, address-plus accepts its shape and it belongs to the region; nothing is guessed. Returns null when there is
 * nothing to show.
 */
export function formatVenueAddress(p: VenueAddressParts): VenueAddress | null {
  const city = cityName(p.city);
  const region = tidy(p.region);
  const code = (p.countryCode ?? "").toUpperCase();
  const postal = goodPostal(tidy(p.postal), region);
  let street = tidy(p.street);

  if (street) {
    const parsed = parseLocation([street, city, region].filter(Boolean).join(", "));
    // Trust the library only when it read a house number, a street and a street type (a venue's name in place of a street is kept as it came).
    if (parsed && "number" in parsed && parsed.number && parsed.street && parsed.type !== undefined) {
      const line = formatAddress({ ...parsed, city: undefined, state: undefined, zip: undefined, plus4: undefined, country: undefined }).deliveryLine;
      if (line) street = keepInitialisms(line, street);
    }
  }

  const regionCode = [region, postal].filter(Boolean).join(" ");
  const place = code === "CA" ? [city, regionCode].filter(Boolean).join(" ") : [city, regionCode].filter(Boolean).join(", ");
  const lines = [street, place, tidy(p.country)].filter(Boolean);
  return lines.length ? { lines, text: lines.join(", ") } : null;
}
