// Normalise venue street addresses with @johnmorrisdotca/address-plus.
// Usage: node address_normalise.mjs <in.json> <out.json>
// in:  [{qid, label, raw, postal, city, region, country}]  (city/region/country are the place hints from Wikidata's location chain)
// out: [{qid, street, city, region, postal, country, parsed}]
// region is an ISO 3166-2 code (US-FL, CA-ON). The street is the delivery line of
// USPS (US) or Canada Post (CA) formatting; nothing is guessed when the parser cannot read it.
import { readFileSync, writeFileSync } from "node:fs";
import { parseLocation, formatUSPS, formatCanadaPost, normalizeRegion } from "@johnmorrisdotca/address-plus";

const strip = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = [];
for (const r of rows) {
  const o = { qid: r.qid, street: null, city: r.city || null, region: r.region || null, postal: null, country: r.country || null, parsed: false };
  const code = r.region ? r.region.split("-")[1] : null;
  if (r.raw) {
    let s = r.raw.replace(/\s+/g, " ").trim();
    // Add the place hints the string lacks, so the parser is not left to read "Northwest" as a territory.
    if (r.city && !strip(s).includes(strip(r.city))) s += ", " + r.city;
    if (code && !new RegExp(`(^|[ ,])${code}([ ,]|$)`, "i").test(s)) s += ", " + code;
    if (r.postal && !strip(s).includes(strip(r.postal))) s += " " + r.postal;
    const p = parseLocation(s);
    if (p && p.number && p.street) {
      const cc = r.country || p.country;
      const f = cc === "CA" ? formatCanadaPost(p) : formatUSPS(p);
      o.street = f.deliveryLine || null;
      o.parsed = !!o.street;
      if (p.zip && p.zipValid !== false) o.postal = p.plus4 ? `${p.zip}-${p.plus4}` : p.zip;
      if (!o.city && p.city && !/\d/.test(p.city)) o.city = p.city;
      if (!o.country && p.country) o.country = p.country;
      if (!o.region && p.state && o.country) o.region = `${o.country}-${p.state}`;
    }
  }
  if (!o.postal && r.postal) {
    const p = parseLocation("1 Main St, X " + (r.country === "CA" ? "ON " : "NY ") + r.postal);
    if (p && p.zip && p.zipValid) o.postal = p.plus4 ? `${p.zip}-${p.plus4}` : p.zip;
  }
  out.push(o);
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(out.length, "addresses,", out.filter((x) => x.parsed).length, "parsed,", out.filter((x) => x.postal).length, "with postal code");
