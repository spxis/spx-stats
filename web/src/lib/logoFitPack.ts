import { z } from "zod";
import type { LogoFit } from "./logoFit.ts";

/** Every row of api.logo_fit in one row, as api.logo_fit_pack gives them (migration 179): the rows without their thirteen column names repeated. */
const strN = z.string().nullable();

export const logoFitPackSchema = z.object({
  fits: z.array(z.tuple([z.string(), strN, z.string(), z.boolean(), strN, strN, strN, z.number(), z.number(), z.number(), z.string(), z.enum(["proposed", "approved", "rejected"]), strN])),
});
export type LogoFitPackRow = z.infer<typeof logoFitPackSchema>;

/** The rows of api.logo_fit by logo file. */
export function logoFitsFromPack(packs: readonly LogoFitPackRow[]): LogoFit[] {
  return packs.flatMap((p) => p.fits.map((f): LogoFit => ({
    logo_file: f[0], league: f[1], team: f[2], wordmark: f[3], mark_url: f[4], mark_licence: f[5], mark_page: f[6],
    scale: f[7], dx: f[8], dy: f[9], bg: f[10], status: f[11], note: f[12],
  })));
}
