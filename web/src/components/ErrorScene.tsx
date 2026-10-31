import type { ReactNode } from "react";

export type ErrorArt = "404" | "500" | "load";

/** A centred error with the SPXN puck: the picture, a heading, one line, then the buttons passed as children. */
export default function ErrorScene({ art, title, lede, small, role, children }: {
  art: ErrorArt; title: string; lede?: string; small?: boolean; role?: "alert" | "status"; children?: ReactNode;
}) {
  const Title = small ? "p" : "h1";
  return (
    <section className={small ? "errscene small" : "errscene"} role={role}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/mascot/mascot-${art}-colour.svg`} alt="" width={1024} height={1024} decoding="async" loading="lazy" />
      <Title className="errtitle">{title}</Title>
      {lede ? <p className="errlede">{lede}</p> : null}
      {children ? <div className="erract">{children}</div> : null}
    </section>
  );
}
