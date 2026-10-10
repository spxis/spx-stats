import Link from "next/link";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <section className="head fade">
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
        <p className="lede">There is nothing at this address. It may be a season or team the archive does not hold.</p>
      </section>
      <p><Link href="/">Back to the start</Link></p>
    </>
  );
}
