import { z } from "zod";

/* Rows of the views the trophy pages read: `api.awards` (every winner of every award, db/migrations/015 and 026) and `api.award_list` (the awards themselves). */

const str = z.string();
const strN = z.string().nullable();
const int = z.number();
const intN = z.number().nullable();

export const trophyRowSchema = z.object({
  year: int, award_code: str, award: str, kind: str, winner: strN, note: strN, franchise_id: intN, person_id: intN,
});

export const trophyInfoSchema = z.object({ league: str, code: str, name: str, kind: str, description: strN });
