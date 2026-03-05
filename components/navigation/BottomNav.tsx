"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isPlaylists = pathname === "/playlists" || pathname.startsWith("/playlists/");
  const isYou = pathname === "/you";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 h-[52px] border-t border-white/10 bg-[rgba(8,0,23,0.88)] backdrop-blur-[20px]">
      <div className="mx-auto flex h-full w-full max-w-[1140px] items-center justify-center gap-2 px-4 md:px-6">
        <Link
          href="/"
          className={`rounded-full px-4 py-2 text-[13px] [font-family:var(--font-roboto-condensed)] ${
            isHome ? "bg-[#5A22C9] text-white" : "text-white/85 hover:bg-white/10"
          }`}
        >
          Home
        </Link>
        <Link
          href="/playlists"
          className={`rounded-full px-4 py-2 text-[13px] [font-family:var(--font-roboto-condensed)] ${
            isPlaylists ? "bg-[#5A22C9] text-white" : "text-white/85 hover:bg-white/10"
          }`}
        >
          Playlists
        </Link>
        <Link
          href="/you"
          className={`rounded-full px-4 py-2 text-[13px] [font-family:var(--font-roboto-condensed)] ${
            isYou ? "bg-[#5A22C9] text-white" : "text-white/85 hover:bg-white/10"
          }`}
        >
          You
        </Link>
      </div>
    </nav>
  );
}
