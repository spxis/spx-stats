/**
 * The packed counts of core.batted_ball_player_hand (migration 165; the packing is written at the top of db/migrations/072_batted_ball.sql): per zone of Retrosheet's
 * hit-location diagram, how many balls ended each way, and per ball type. Pure, with no server-only imports, so the page's browser code, the data route and the tests share it.
 */

/** Retrosheet's 68 zones in the order of ref.hit_zone.zone_idx, the number the cells use (never renumbered). scripts/playerSpray.test.ts checks it against the migration. */
export const ZONE_CODES = [
  "2", "2F", "1S", "1", "25", "23", "25F", "23F", "15", "13", "5S", "3S", "56S", "34S", "6S", "4S", "6MS", "4MS", "6M", "4M", "5F", "3F", "5", "3", "56", "34", "6", "4",
  "5D", "3D", "5DF", "3DF", "56D", "34D", "6D", "4D", "6MD", "4MD", "7LSF", "9LSF", "7LF", "9LF", "7LDF", "9LDF", "7LS", "7L", "7LD", "7S", "7", "7D", "78S", "78", "78D", "78XD",
  "8S", "8", "8D", "8XD", "89S", "89", "89D", "89XD", "9S", "9", "9D", "9LS", "9L", "9LD",
] as const;

/** Where each zone's centre is: feet from home plate, x to the right of the plate as the batter looks out and y towards centre field. The same figures as kyogijo's RETROSHEET_ZONES (the test compares). */
export const ZONE_XY: Record<string, readonly [number, number]> = {
  "1": [0, 60.5], "2": [0, 13], "3": [78, 92], "4": [39, 131], "5": [-78, 92], "6": [-39, 131], "7": [-149.4, 248.6], "8": [0, 290], "9": [149.4, 248.6],
  "13": [16, 54], "15": [-16, 54], "23": [26, 33], "25": [-26, 33], "34": [61, 107], "56": [-61, 107], "78": [-79.9, 278.8], "89": [79.9, 278.8],
  "2F": [0, -22], "1S": [0, 37], "25F": [-36, 22], "23F": [36, 22], "5S": [-49, 55], "3S": [49, 55], "56S": [-41, 73], "34S": [41, 73], "6S": [-23, 86], "4S": [23, 86],
  "6MS": [-8, 105], "4MS": [8, 105], "6M": [-10, 146], "4M": [10, 146], "5F": [-85, 73], "3F": [85, 73], "5D": [-118, 139], "3D": [118, 139], "5DF": [-134, 119], "3DF": [134, 119],
  "56D": [-90, 160], "34D": [90, 160], "6D": [-50, 179], "4D": [50, 179], "6MD": [-16, 188], "4MD": [16, 188], "7LSF": [-181, 160], "9LSF": [181, 160], "7LF": [-215, 200], "9LF": [215, 200],
  "7LDF": [-236, 222], "9LDF": [236, 222], "7S": [-122.6, 204], "7D": [-170, 282.9], "8S": [0, 238], "8D": [0, 330], "8XD": [0, 380], "9S": [122.6, 204], "9D": [170, 282.9],
  "78S": [-65.6, 228.8], "78D": [-91, 317.2], "78XD": [-104.7, 365.3], "89S": [65.6, 228.8], "89D": [91, 317.2], "89XD": [104.7, 365.3],
  "7LS": [-154.6, 181], "7L": [-188.3, 220.5], "7LD": [-214.3, 250.9], "9LS": [154.6, 181], "9L": [188.3, 220.5], "9LD": [214.3, 250.9],
};

/** The results a cell counts, in the order of the mask's bits. */
export const RESULTS = ["out", "single", "double", "triple", "home_run", "error", "fielders_choice"] as const;
export type Result = (typeof RESULTS)[number];
/** The ball types a traj counts, in order: ground ball, line drive, fly ball, pop-up, and the bunted three. */
export const TRAJS = ["G", "L", "F", "P", "BG", "BP", "BL"] as const;

/** Counts by result for each zone code that has a ball. */
export type ZoneCounts = Map<string, number[]>;

const bytesOf = (hex: string): Uint8Array => {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** A base-128 varint (7 bits a byte, the high bit says more follow), and where the next value starts. */
function varint(b: Uint8Array, pos: number): [number, number] {
  let v = 0, shift = 0, p = pos;
  for (;;) {
    const byte = b[p++];
    if (byte === undefined) return [v, p];
    v += (byte & 127) * 2 ** shift;
    shift += 7;
    if (byte < 128) return [v, p];
  }
}

/** The cells of one row (hex text of the packed bytes) as counts by zone code and result. A zone number the diagram does not have is skipped, never guessed. */
export function unpackCells(hex: string): ZoneCounts {
  const b = bytesOf(hex), out: ZoneCounts = new Map();
  let pos = 0;
  while (pos + 1 < b.length) {
    const zone = ZONE_CODES[b[pos]!], mask = b[pos + 1]!;
    pos += 2;
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 7; k++) {
      if (((mask >> k) & 1) === 0) continue;
      const [v, next] = varint(b, pos);
      counts[k] = v;
      pos = next;
    }
    if (zone) out.set(zone, counts);
  }
  return out;
}

/** The seven ball-type counts of one row's traj, always seven (G L F P BG BP BL). */
export function unpackTraj(hex: string): number[] {
  const b = bytesOf(hex), out: number[] = [];
  let pos = 0;
  for (let k = 0; k < 7; k++) {
    const [v, next] = varint(b, pos);
    out.push(v);
    pos = next;
  }
  return out;
}

/** The angle of a zone's centre from the line to centre field, in degrees: negative towards left field. A zone on the plate's own line (the catcher's, the mound) is 0. */
export function zoneAngle(zone: string): number {
  const [x, y] = ZONE_XY[zone] ?? [0, 100];
  return (Math.atan2(x, Math.max(y, 1)) * 180) / Math.PI;
}

export type Side = "pull" | "centre" | "oppo";

/**
 * Which way a ball went for the batter who hit it: the fair ground is split into thirds of thirty degrees about the line to centre field, so a right-handed
 * batter pulls to the left third and goes to the opposite field to the right third, and a left-handed one the other way round. A ball in foul ground goes by the side
 * it fell on; a zone on the plate's own line (behind it, the mound) is the middle.
 */
export function sideOf(zone: string, hand: "L" | "R"): Side {
  const a = zoneAngle(zone);
  if (a > -15 && a < 15) return "centre";
  const leftward = a < 0;
  return leftward === (hand === "R") ? "pull" : "oppo";
}
