import assert from "node:assert/strict";
import { test } from "node:test";
import { formatVenueAddress } from "../src/lib/venueAddress.ts";

/** Run in web/: pnpm test:address */

test("Rogers Place, Edmonton: Canada Post's last line, country last", () => {
  const a = formatVenueAddress({ street: "10220 104 Ave NW", city: "Edmonton", region: "AB", countryCode: "CA", country: "Canada" });
  assert.deepEqual(a?.lines, ["10220 104 Ave NW", "Edmonton AB", "Canada"]);
  assert.equal(a?.text, "10220 104 Ave NW, Edmonton AB, Canada");
});

test("Lumen Field, Seattle: the comma form, no postal code invented", () => {
  const a = formatVenueAddress({ street: "800 Occidental Ave S", city: "Seattle", region: "WA", countryCode: "US", country: "United States" });
  assert.deepEqual(a?.lines, ["800 Occidental Ave S", "Seattle, WA", "United States"]);
});

test("Bell Centre, Montreal: accents and hyphens in the street are kept", () => {
  const a = formatVenueAddress({ street: "1909 Canadiens-De-Montréal Ave", city: "Montreal", region: "QC", countryCode: "CA", country: "Canada" });
  assert.deepEqual(a?.lines, ["1909 Canadiens-De-Montréal Ave", "Montreal QC", "Canada"]);
});

test("a given postal code is shown when its shape and region agree", () => {
  assert.equal(formatVenueAddress({ street: "800 Occidental Ave S", city: "Seattle", region: "WA", postal: "98134", countryCode: "US" })?.text, "800 Occidental Ave S, Seattle, WA 98134");
  assert.equal(formatVenueAddress({ street: "10220 104 Ave NW", city: "Edmonton", region: "AB", postal: "t5j0h6", countryCode: "CA" })?.text, "10220 104 Ave NW, Edmonton AB T5J 0H6");
});

test("the codes Wikidata gives (api.venue_info.postal_code) read well beside the region the place gives", () => {
  assert.equal(formatVenueAddress({ street: "1500 South Capitol St SE", city: "Washington, D.C.", region: "DC", postal: "20003", countryCode: "US", country: "United States" })?.text,
    "1500 S Capitol St SE, Washington, DC 20003, United States");
  assert.equal(formatVenueAddress({ street: "777 Pacific Blvd", city: "Vancouver", region: "BC", postal: "V6B 4Y8", countryCode: "CA", country: "Canada" })?.lines.at(1), "Vancouver BC V6B 4Y8");
});

test("a postal code of another region, or of no known shape, is dropped", () => {
  assert.equal(formatVenueAddress({ street: "800 Occidental Ave S", city: "Seattle", region: "WA", postal: "90210", countryCode: "US" })?.text, "800 Occidental Ave S, Seattle, WA");
  assert.equal(formatVenueAddress({ street: "800 Occidental Ave S", city: "Seattle", region: "WA", postal: "12", countryCode: "US" })?.text, "800 Occidental Ave S, Seattle, WA");
});

test("missing parts are left out, never filled in", () => {
  assert.deepEqual(formatVenueAddress({ city: "Edmonton", region: "AB", countryCode: "CA", country: "Canada" })?.lines, ["Edmonton AB", "Canada"]);
  assert.deepEqual(formatVenueAddress({ street: "1 Royal Way", country: "United States" })?.lines, ["1 Royal Way", "United States"]);
  assert.deepEqual(formatVenueAddress({ street: "1 Royal Way", city: "Kansas City" })?.lines, ["1 Royal Way", "Kansas City"]);
  assert.equal(formatVenueAddress({}), null);
  assert.equal(formatVenueAddress({ street: "  ", city: null, region: "", country: "" }), null);
});

test("a venue's name where the street should be is kept as given", () => {
  assert.deepEqual(formatVenueAddress({ street: "1 Paycor Stadium", city: "Cincinnati", region: "OH", countryCode: "US" })?.lines, ["1 Paycor Stadium", "Cincinnati, OH"]);
});

test("wiki markup after a street is cut off", () => {
  const a = formatVenueAddress({ street: "500 David J. Stern Walk<ref>{{Cite web | url=https://example.org/x", city: "Sacramento", region: "CA", countryCode: "US" });
  assert.deepEqual(a?.lines, ["500 David J. Stern Walk", "Sacramento, CA"]);
});

test("street types are written address-plus's way, and a direction keeps its capitals", () => {
  assert.equal(formatVenueAddress({ street: "3700 SW Freeway", city: "Houston", region: "TX", countryCode: "US" })?.lines[0], "3700 SW Fwy");
  assert.equal(formatVenueAddress({ street: "1 N Center Court St", city: "Portland", region: "OR", countryCode: "US" })?.lines[0], "1 N Center Court St");
});

test("Washington, D.C. is written once", () => {
  assert.equal(formatVenueAddress({ street: "601 F St NW", city: "Washington, D.C.", region: "DC", countryCode: "US", country: "United States" })?.text, "601 F St NW, Washington, DC, United States");
});
