"use client";

/** Only when the layout itself fails: it replaces the whole document, so it carries no site styles and no language choice. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <p>Couldn’t load this right now — try again</p>
        <button type="button" onClick={() => retry()}>Try again</button>
      </body>
    </html>
  );
}
