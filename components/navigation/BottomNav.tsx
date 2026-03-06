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
    { href: "/explore", active: isExplore, icon: faMusicMagnifyingGlass, label: "Explore" },
    {
      href: "/playlists",
      active: isPlaylists,
      icon: faAlbumCollectionCircleUser,
      label: "Playlists",
    },
    { href: "/you", active: isYou, icon: faClockRotateLeft, label: "You" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 h-[calc(52px+env(safe-area-inset-bottom))] border-t border-white/10 bg-[rgba(8,0,23,0.88)] pb-[env(safe-area-inset-bottom)] backdrop-blur-[20px]">
      <div className="mx-auto flex h-[52px] w-full max-w-[1140px] items-center px-4 md:justify-center md:px-6">
        <div className="flex h-[44px] w-full items-center gap-1 rounded-[48px] bg-[rgba(15,3,37,0.4)] p-1 md:w-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={`flex h-[36px] flex-1 items-center justify-center rounded-[24px] px-3 text-white transition-colors md:min-w-[68px] md:flex-none md:px-6 ${
                item.active
                  ? "bg-[#351574] shadow-[1px_2px_8px_0px_rgba(0,0,0,0.22)]"
                  : "hover:bg-white/10"
              }`}
            >
              <FontAwesomeIcon icon={item.icon} className="text-[16px]" />
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
