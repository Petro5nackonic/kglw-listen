import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — KGLW FM",
  description:
    "How KGLW FM handles data, analytics, and your privacy.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-20 pt-10 text-white [font-family:var(--font-roboto-condensed)] md:px-6">
      <h1 className="text-[28px] leading-tight md:text-[32px]">Privacy</h1>
      <p className="mt-2 text-[13px] text-white/55">
        Last updated: May 2026
      </p>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed text-white/85">
        <p>
          KGLW FM is a fan-built player for live King Gizzard &amp; The
          Lizard Wizard recordings. We&apos;ve tried to keep the privacy story
          short and honest.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] leading-tight">What we don&apos;t collect</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/80">
          <li>No accounts, names, emails, or passwords.</li>
          <li>No advertising trackers or third-party advertising cookies.</li>
          <li>
            No selling, sharing, or renting of any data we do collect — there
            isn&apos;t a customer for it because we don&apos;t have one.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] leading-tight">What we do collect</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white/80">
          We use Google Analytics 4 in aggregate-only mode to understand how
          the app is used and what to improve. Each browser is assigned an
          anonymous random identifier (a UUID stored in your browser&apos;s
          local storage) that lets us tell &quot;new visitor&quot; apart from
          &quot;returning visitor&quot; without ever knowing who you actually
          are. Events we record include:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/80">
          <li>Page views and which navigation tabs you click.</li>
          <li>
            Plays, pauses, completes, skips, and how far through a track you
            listened.
          </li>
          <li>
            Playlist actions you take (creating, deleting, adding songs,
            chaining slots).
          </li>
        </ul>
        <p className="mt-3 text-[15px] leading-relaxed text-white/80">
          You can clear this anonymous identifier at any time by clearing site
          data for this domain in your browser settings, or by using a private
          / incognito window.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] leading-tight">Local storage on your device</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white/80">
          Your playlists, the shows you&apos;ve marked as favorites, and your
          recent activity all live in your browser&apos;s local storage. They
          never leave your device. If you switch browsers or clear site data,
          they&apos;re gone.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] leading-tight">Third-party services</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/80">
          <li>
            <strong>Internet Archive</strong> (archive.org) — provides the
            audio streams and show metadata. When you play a track your
            browser fetches audio directly from archive.org and is subject to
            their{" "}
            <a
              href="https://archive.org/about/terms.php"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              terms of use
            </a>
            .
          </li>
          <li>
            <strong>KGLW.net</strong> — provides setlist and album metadata.
            Some pages fetch from their public API.
          </li>
          <li>
            <strong>Google Analytics 4</strong> — anonymous usage statistics
            (no personal identifiers), governed by{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              Google&apos;s privacy policy
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] leading-tight">Questions</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white/80">
          Reach out via the contact link in the footer if anything here is
          unclear or you want your data removed (note: there&apos;s nothing
          tied to you to remove, but happy to confirm that in writing).
        </p>
      </section>
    </main>
  );
}
