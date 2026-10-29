import "server-only";
import type { GameRow } from "./api/types";
import { brandFor, type BrandMap } from "./brand";
import { DRIVE_KINDS, BALL_KINDS, drawBalls, drawDrives, parseBalls, parseDrives, zoneWhere, type Ball, type Drive } from "./fieldPlays";
import { getBatterNames, type FieldRow } from "./gameField";
import type { Speaker } from "./i18n/i18n";
import { seriesLooks } from "./seriesLooks";

/**
 * One game's plays as a drawing, for the page (which needs only its shape) and for the file the page loads when the drawing comes into view
 * (app/field-plays/[file]/route.ts). Both call this, so the file is the drawing the page sized its box for. A baseball game is drawn on its park (the kyogijo key
 * the page worked out, or the standard field) as it stood that season; a football game on the field as the league marked it that season, wide, or tall for a phone.
 */
export interface FieldDrawing { svg: string; width: number; height: number }

const looks = (g: Pick<GameRow, "league" | "year" | "away_f" | "home_f">, brands: BrandMap) =>
  seriesLooks(g.league, brandFor(brands, g.away_f, g.year), brandFor(brands, g.home_f, g.year));

export async function drawMlbBalls(
  row: FieldRow, g: Pick<GameRow, "league" | "year" | "away" | "home" | "away_f" | "home_f">, brands: BrandMap, sp: Pick<Speaker, "say" | "locale">, park: string | null, named: boolean,
): Promise<FieldDrawing & { balls: Ball[] }> {
  const { say } = sp;
  const balls = parseBalls(row.data);
  const [la, lb] = looks(g, brands);
  const away = g.away ?? "—", home = g.home ?? "—";
  const names = named ? await getBatterNames(balls.flatMap((b) => (b.person ? [b.person] : []))) : new Map<number, string>();
  const kindOf = (b: Ball) => BALL_KINDS.find((k) => (k.codes as readonly string[]).includes(b.result))!;
  const d = drawBalls(balls, {
    park, year: g.year, away: { name: away, color: la.block }, home: { name: home, color: lb.block }, language: sp.locale === "ja" ? "ja" : "en",
    title: say("fp.mlbAria", { away, home }),
    label: named
      ? (b) => {
        const w = zoneWhere(b.zone);
        return say("fp.ballLine", {
          when: say(b.half ? "fp.ballBottom" : "fp.ballTop", { inning: b.inning }), batter: (b.person ? names.get(b.person) : null) ?? say("fp.batter"),
          result: say(kindOf(b).phrase), how: say(`fp.traj${b.traj}` as "fp.trajG"), where: say("fp.where", { lane: say(w.lane), depth: say(w.depth) }),
        });
      }
      : undefined,
  });
  return { ...d, balls };
}

/** The standard baseball field with nothing on it (a player's spray charts lay their marks over it, in the viewBox of FIELD_BOX in lib/playerSpray.ts), in the reader's language. */
export function drawStdField(sp: Pick<Speaker, "say" | "locale">): FieldDrawing {
  return drawBalls([], {
    park: null, year: 2025, away: { name: "", color: "" }, home: { name: "", color: "" }, language: sp.locale === "ja" ? "ja" : "en", title: sp.say("spray.fieldAria"),
  });
}

export async function drawNflDrives(
  row: FieldRow, g: Pick<GameRow, "league" | "year" | "away" | "home" | "away_f" | "home_f">, brands: BrandMap, sp: Pick<Speaker, "say" | "locale">, part: "wide" | "phone",
): Promise<FieldDrawing & { drives: Drive[] }> {
  const { say } = sp;
  const drives = parseDrives(row.data);
  const [la, lb] = looks(g, brands);
  const away = g.away ?? "—", home = g.home ?? "—";
  const d = drawDrives(drives, {
    year: g.year, away: { name: away, color: la.block }, home: { name: home, color: lb.block }, language: sp.locale === "ja" ? "ja" : "en", orientation: part === "phone" ? "tall" : "wide",
    title: say("fp.nflAria", { away, home }),
    label: (x, kind) => {
      const team = x.side ? home : away;
      const when = [x.qtr ? (x.qtr > 4 ? say("fp.overtime") : say("fp.quarter", { n: x.qtr })) : "", x.clock].filter(Boolean).join(" ");
      const found = DRIVE_KINDS.find((k) => k.result === (kind === "return" ? "O" : x.result === "O" ? "X" : x.result));
      const result = found ? say(found.phrase) : "";
      return x.plays != null ? say("fp.driveLine", { team, when, result, plays: x.plays }) : say("fp.driveLineNoPlays", { team, when, result });
    },
  });
  return { ...d, drives };
}
