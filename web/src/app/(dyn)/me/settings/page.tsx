import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const user = await requireUser("/me/settings");
  return (
    <>
      <section className="head fade">
        <h1>Settings</h1>
        <p className="lede">Preferences are kept in this browser (cookie and local storage), not on our servers.</p>
      </section>
      <section className="section">
        <h2>Language</h2>
        <LanguagePicker />
      </section>
      <section className="section">
        <h2>Theme</h2>
        <div><ThemeToggle /></div>
      </section>
      <section className="section">
        <h2>Account</h2>
        <p className="note">Signed in as {user.email} with Google.</p>
        <SignOutButton />
      </section>
    </>
  );
}
