import { Fragment, type ReactNode } from "react";

/**
 * A phrase with places for links or markup: `{name}` in the text is replaced by `parts.name`.
 * The text is the phrase after `say()` (which leaves a `{name}` it was given no value for standing).
 */
export function Rich({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  const pieces = text.split(/(\{\w+\})/);
  return (
    <>
      {pieces.map((p, i) => {
        const m = /^\{(\w+)\}$/.exec(p);
        return m && Object.hasOwn(parts, m[1]) ? <Fragment key={i}>{parts[m[1]]}</Fragment> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
