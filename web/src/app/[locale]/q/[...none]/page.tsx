import { notFound } from "next/navigation";

/** An address that is no page of the site (lib/routing.ts sends it here): the 404, drawn for the request and not kept. */
export const dynamic = "force-dynamic";

export default function NoPage(): never {
  notFound();
}
