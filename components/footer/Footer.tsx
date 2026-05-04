"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faHeart,
  faMugSaucer,
  faShieldHalved,
} from "@fortawesome/pro-solid-svg-icons";
import { trackEvent } from "@/utils/analytics";

// IMPORTANT: replace these placeholder URLs/handles with your real values.
// They are intentionally separated as constants so the file is the single
// source of truth for "social/contact" links across the site.
const CONTACT_EMAIL = "hello@example.com"; // TODO: set your real address
const GITHUB_URL = ""; // TODO: e.g. "https://github.com/<you>/kglw-listen" — leave empty to hide
const DONATION_URL = ""; // TODO: e.g. "https://buymeacoffee.com/<you>" — leave empty to hide
const ARCHIVE_URL = "https://archive.org/details/KingGizzardAndTheLizardWizard";
const KGLW_NET_URL = "https://kglw.net";
const BAND_TAPING_POLICY_URL = "https://kglw.net";

const APP_LAUNCH_YEAR = 2026;

function GitHubMark({ className }: { className?: string }) {
  // Inline SVG keeps us off the @fortawesome/free-brands-svg-icons package,
  // which would otherwise be the only reason to add a new dependency.
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function FooterLink({
  href,
  external,
  onClick,
  children,
}: {
  href: string;
  external?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-white/70 transition hover:text-white"
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-white/70 transition hover:text-white"
    >
      {children}
    </Link>
  );
}

export function Footer() {
  const currentYear = new Date().getFullYear();
  const yearLabel =
    currentYear > APP_LAUNCH_YEAR
      ? `${APP_LAUNCH_YEAR}–${currentYear}`
      : String(APP_LAUNCH_YEAR);

  function logFooterClick(target: string) {
    trackEvent("footer_click", { target });
  }

  return (
    <footer
      className="mt-16 border-t border-white/10 bg-[#080017] [font-family:var(--font-roboto-condensed)]"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">
        Site footer
      </h2>
      <div className="mx-auto w-full max-w-[1140px] px-5 py-10 md:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Brand + tagline */}
          <div>
            <div className="text-[18px] leading-none text-white">KGLW FM</div>
            <p className="mt-2 max-w-[28ch] text-[13px] leading-snug text-white/60">
              A fan-built live archive player for King Gizzard &amp; The Lizard
              Wizard. Built with{" "}
              <FontAwesomeIcon icon={faHeart} className="text-rose-300/90" /> for
              the taping community.
            </p>
          </div>

          {/* Connect */}
          <div>
            <div className="text-[12px] uppercase tracking-[0.12em] text-white/40">
              Connect
            </div>
            <ul className="mt-3 space-y-2 text-[14px]">
              <li>
                <FooterLink
                  href={`mailto:${CONTACT_EMAIL}`}
                  external
                  onClick={() => logFooterClick("contact")}
                >
                  <FontAwesomeIcon icon={faEnvelope} className="text-[12px]" />
                  Contact
                </FooterLink>
              </li>
              {GITHUB_URL ? (
                <li>
                  <FooterLink
                    href={GITHUB_URL}
                    external
                    onClick={() => logFooterClick("github")}
                  >
                    <GitHubMark className="h-3.5 w-3.5" />
                    GitHub
                  </FooterLink>
                </li>
              ) : null}
              {DONATION_URL ? (
                <li>
                  <FooterLink
                    href={DONATION_URL}
                    external
                    onClick={() => logFooterClick("donate")}
                  >
                    <FontAwesomeIcon icon={faMugSaucer} className="text-[12px]" />
                    Buy me a coffee
                  </FooterLink>
                </li>
              ) : null}
              <li>
                <FooterLink
                  href="/privacy"
                  onClick={() => logFooterClick("privacy")}
                >
                  <FontAwesomeIcon icon={faShieldHalved} className="text-[12px]" />
                  Privacy
                </FooterLink>
              </li>
            </ul>
          </div>

          {/* Attribution */}
          <div>
            <div className="text-[12px] uppercase tracking-[0.12em] text-white/40">
              Data &amp; Audio
            </div>
            <p className="mt-3 text-[13px] leading-snug text-white/60">
              Live audio and show metadata streamed from the{" "}
              <a
                href={ARCHIVE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logFooterClick("archive_org")}
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                Internet Archive
              </a>
              . Setlist and album data courtesy of{" "}
              <a
                href={KGLW_NET_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logFooterClick("kglw_net")}
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                KGLW.net
              </a>
              .
            </p>
            <p className="mt-3 text-[13px] leading-snug text-white/60">
              Live recordings are shared with the band&apos;s{" "}
              <a
                href={BAND_TAPING_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logFooterClick("taping_policy")}
                className="text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                explicit blessing
              </a>
              .
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="text-[12px] leading-relaxed text-white/45">
            Not affiliated with, endorsed by, or sponsored by King Gizzard
            &amp; The Lizard Wizard, the Internet Archive, or KGLW.net. All
            audio recordings, song titles, and album artwork remain the
            property of their respective rights holders.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-[12px] text-white/45 md:flex-row md:items-center md:justify-between">
            <span>© {yearLabel} KGLW FM. All rights reserved.</span>
            <span className="text-white/35">
              Made by fans, for fans.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
