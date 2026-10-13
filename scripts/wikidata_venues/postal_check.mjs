// Check the postal codes Wikidata (P281) gives for venues, with @johnmorrisdotca/address-plus.
// Usage: node postal_check.mjs <in.json> <out.json>
// in:  [{qid, raw, region, country}]   raw is the code as stored; region is an ISO 3166-2 code (US-WA, CA-AB); country an ISO alpha-2 code
// out: [{qid, checked, problem}]       checked is the code in its standard form, or null; problem says why it was refused
// A code is kept only when its shape is a US ZIP or a Canadian postal code, it matches the venue's country and it belongs to the venue's
// state or province. Nothing is repaired or guessed: any other code is refused with the reason.
import { readFileSync, writeFileSync } from "node:fs";
import { validatePostalCode, getStateFromZip, getProvinceFromPostalCode } from "@johnmorrisdotca/address-plus";

const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = rows.map((r) => {
  const refuse = (problem) => ({ qid: r.qid, checked: null, problem });
  const raw = String(r.raw ?? "").trim();
  if (!raw) return refuse("empty");
  if (raw.includes(";")) return refuse(`Wikidata gives more than one code (${raw})`);
  const v = validatePostalCode(raw);
  if (!v.isValid || !v.formatted) return refuse(`not a US ZIP or Canadian postal code (${raw})`);
  const country = v.type === "zip" ? "US" : "CA";
  if (r.country && r.country.toUpperCase() !== country) return refuse(`${raw} is a ${country} code but the venue is in ${r.country}`);
  const belongs = v.type === "zip" ? getStateFromZip(v.formatted) : getProvinceFromPostalCode(v.formatted);
  const region = (r.region ?? "").split("-")[1]?.toUpperCase() ?? "";
  if (!region) return refuse(`the venue's state or province is not known, so ${raw} cannot be checked`);
  if (!belongs) return refuse(`no state or province is known for ${raw}`);
  if (belongs !== region) return refuse(`${raw} belongs to ${belongs} but the venue is in ${region}`);
  return { qid: r.qid, checked: v.formatted, problem: null };
});
writeFileSync(process.argv[3], JSON.stringify(out));
console.log(out.length, "codes,", out.filter((x) => x.checked).length, "accepted,", out.filter((x) => !x.checked).length, "refused");
