import { ballPoints, driveLane, FIELD_FT_HIGH, FT_PER_YD, xOf, type Ball, type Drive } from "./fieldPlays.ts";
import type { BallWire, DriveWire, MlbWire, NflWire, PlayTeam } from "./playTimeline.ts";

/**
 * The replay's data for one game (app/field-plays, components/FieldPlayer.tsx): the rows the still drawing is made of, with every place already worked out in the
 * drawing's own units, so the browser moves the marks the file holds and needs no park, fence or zone data. Pure (no server-only imports) so the route and the checks share it.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

/** An MLB game's balls in the order hit, each with the place the still drawing gives its mark (home plate is 0, 0 and the field runs up the page, so y is negative). */
export function mlbWire(balls: readonly Ball[], o: { park: string | null; year: number; teams: [PlayTeam, PlayTeam]; score: [number | null, number | null] }): MlbWire {
  const pts = ballPoints(balls, o.park, o.year);
  return {
    sport: "mlb", teams: o.teams, score: o.score,
    balls: balls.map((b, i): BallWire => [b.inning, b.half, b.result, b.traj, pts[i]!.x, -pts[i]!.y + 0]),
  };
}

/** An NFL game's drives, with the lane and the lines as the file draws them (feet; the file's wide drawing, which the tall one only turns). */
export function nflWire(drives: readonly Drive[], o: { teams: [PlayTeam, PlayTeam]; score: [number | null, number | null] }): NflWire {
  const n = Math.max(drives.length, 1);
  const x = (side: 0 | 1, yd: number) => r2(xOf(side, yd) * FT_PER_YD);
  return {
    sport: "nfl", teams: o.teams, score: o.score,
    drives: drives.map((d, i): DriveWire => ({
      side: d.side, qtr: d.qtr, clock: d.clock, result: d.result, plays: d.plays,
      y: r2(FIELD_FT_HIGH - FT_PER_YD * driveLane(i, n)),
      x0: x(d.side, d.start), x1: x(d.side, d.end), xs: d.los.map((yd) => x(d.side, yd)),
      xr: d.result === "O" ? x(d.side === 0 ? 1 : 0, 0) : null,
    })),
  };
}
