import { z } from "zod";
import type { TeamBrandRow } from "./api/types.ts";

/**
 * The brand eras of every franchise as api.team_brand_pack gives them (migration 176): one row for each franchise, its logo files once
 * ([address, licence, file page]) and its eras as short arrays that point into them. Read in one request instead of the three the whole of
 * api.team_brand took.
 */
const strN = z.string().nullable();
const numN = z.number().nullable();

export const brandPackSchema = z.object({
  franchise_id: z.number(),
  logos: z.array(z.tuple([z.string(), strN, strN])),
  eras: z.array(z.tuple([z.string(), strN, strN, strN, strN, numN, z.string(), strN, numN, numN])),
});
export type BrandPackRow = z.infer<typeof brandPackSchema>;

/** The rows of api.team_brand, in the order the view gives them, from its pack. */
export function brandRowsFromPack(packs: readonly BrandPackRow[]): TeamBrandRow[] {
  const out: TeamBrandRow[] = [];
  for (const p of packs) {
    for (const e of p.eras) {
      const logo = e[5] == null ? null : p.logos[e[5]];
      if (e[5] != null && !logo) throw new Error(`team_brand_pack: era of franchise ${p.franchise_id} points at logo ${e[5]}, which is not there`);
      out.push({
        league: e[0], franchise_id: p.franchise_id, brand_from: e[1], brand_to: e[2], primary_hex: e[3], secondary_hex: e[4],
        logo_url: logo ? logo[0] : null, logo_licence: logo ? logo[1] : null, logo_page: logo ? logo[2] : null,
        source: e[6], home_venue: e[7], latitude: e[8], longitude: e[9],
      });
    }
  }
  return out;
}
