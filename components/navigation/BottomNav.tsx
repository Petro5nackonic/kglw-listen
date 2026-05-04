"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAlbumCollectionCircleUser,
  faClockRotateLeft,
  faHouse,
  faMusicMagnifyingGlass,
} from "@fortawesome/pro-solid-svg-icons";
import { usePlaylists } from "@/components/playlists/store";
import { trackNavClick } from "@/utils/analytics";

export function BottomNav() {
  const pathname = usePathname();
  const playlists = usePlaylists((s) => s.playlists);
  const playlistDetailId = pathname.startsWith("/playlists/")
    ? decodeURIComponent(pathname.split("/")[2] || "")
    : "";
  const activePlaylist = playlistDetailId
    ? playlists.find((p) => p.id === playlistDetailId)
    : undefined;
  const isPrebuiltPlaylistDetail = Boolean(
    activePlaylist &&
      (activePlaylist.source === "prebuilt" ||
        activePlaylist.prebuiltKind === "album-live-comp"),
  );
  const isHome = pathname === "/" || isPrebuiltPlaylistDetail;
  const isPlaylists =
    (pathname === "/playlists" || pathname.startsWith("/playlists/")) &&
    !isPrebuiltPlaylistDetail;
  const isYou = pathname === "/you";
  const isExplore = pathname === "/explore";
  const items = [
    { href: "/", active: isHome, icon: faHouse, label: "Home" },
    { href: "/explore", active: isExplore, icon: faMusicMagnifyingGlass, label: "Shows" },
    {
      href: "/playlists",
      active: isPlaylists,
      icon: faAlbumCollectionCircleUser,
      label: "Playlists",
    },
    { href: "/you", active: isYou, icon: faClockRotateLeft, label: "Activity" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 h-[calc(52px+env(safe-area-inset-bottom))] border-t border-white/10 bg-[rgba(8,0,23,0.88)] pb-[env(safe-area-inset-bottom)] backdrop-blur-[20px] md:top-0 md:bottom-auto md:h-16 md:border-t-0 md:border-b md:border-white/10 md:bg-[rgba(8,0,23,0.8)] md:pb-0">
      <div className="mx-auto flex h-[52px] w-full max-w-[1140px] items-center justify-center px-4 md:h-16 md:px-6">
        <div className="flex h-[44px] w-full items-center gap-1 rounded-[48px] bg-[rgba(15,3,37,0.4)] p-1 md:h-auto md:w-auto md:gap-2 md:rounded-none md:bg-transparent md:p-0">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              onClick={() => trackNavClick(item.label, item.href)}
              className={`flex h-[36px] flex-1 flex-col items-center justify-center gap-1 rounded-[24px] px-2 text-white transition-colors md:h-10 md:min-w-[112px] md:flex-row md:gap-2 md:rounded-[12px] md:px-4 ${
                item.active
                  ? "bg-[#351574] shadow-[1px_2px_8px_0px_rgba(0,0,0,0.22)]"
                  : "hover:bg-white/10"
              }`}
            >
              <FontAwesomeIcon icon={item.icon} className="text-[13px]" />
              <span className="text-[10px] leading-none text-white/90 md:text-[13px]">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
