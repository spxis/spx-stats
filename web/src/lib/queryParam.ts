/**
 * Reading one query value of the address by hand. These stand where a one-field zod schema stood (`z.preprocess(first, z.enum([...])).catch(x)`):
 * zod is 30 kB of script, and any module a Client Component imports that also holds a schema brings it to the browser.
 */

/** The first of a repeated key (`?a=1&a=2`), else the value itself. */
export const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/** The value when it is one of `allowed`, else undefined. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const x = first(v);
  return typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : undefined;
}

/** The value when it is a string `shape` matches (write the pattern anchored), else undefined. */
export function shaped(v: unknown, shape: RegExp): string | undefined {
  const x = first(v);
  return typeof x === "string" && shape.test(x) ? x : undefined;
}
