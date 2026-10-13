import Link from "next/link";
import { mlsClubPath } from "@/lib/mlsPath";
import "./soccer.css";

/** An MLS club named in a list or heading: its name (the one it carried in that season, when the caller passes it) as a link to the club's page. No crest: a club's logo is not ours to draw. */
export function MlsClubName({ slug, name, link = true }: { slug: string; name: string; link?: boolean }) {
  return <span className="sct">{link ? <Link href={mlsClubPath(slug)} prefetch={false}>{name}</Link> : name}</span>;
}
