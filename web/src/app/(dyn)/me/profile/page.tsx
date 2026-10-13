import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const user = await requireUser("/me/profile");
  return (
    <>
      <section className="head fade">
        <h1>Profile</h1>
        <p className="lede">What Google tells us about you. We keep none of it: it lives only in your sign-in cookie.</p>
      </section>
      <section className="section profile">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Google avatar URL, not ours to optimise
          <img src={user.image} alt="" width={96} height={96} referrerPolicy="no-referrer" className="profile-img" />
        ) : null}
        <dl>
          <dt>Name</dt>
          <dd>{user.name ?? "Not shared"}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.admin ? "Admin" : "Member"}</dd>
          <dt>Signed in with</dt>
          <dd>Google</dd>
        </dl>
        <p className="note"><Link href="/me/settings">Settings</Link></p>
      </section>
    </>
  );
}
