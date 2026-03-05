"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAlbum,
  faAlbumCollection,
  faEllipsisVertical,
  faMusic,
} from "@fortawesome/pro-solid-svg-icons";
import { clearActivityFeed, readActivityFeed, type ActivityItem } from "@/utils/activityFeed";

function dayLabel(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (startOfDate === startOfToday) return "Today";
  if (startOfDate === startOfToday - oneDay) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function activityParts(item: ActivityItem): { lead: string; emphasis: string; tail?: string } {
  if (item.type === "played_song") {
    const song = item.songTitle || "a song";
    const show = item.showTitle || "a show";
    return {
      lead: `Listened to ${song} from `,
      emphasis: show,
    };
  }
  if (item.type === "played_playlist") {
    return {
      lead: "Listened to ",
      emphasis: item.playlistName || "Untitled playlist",
      tail: " playlist",
    };
  }
  return {
    lead: "Listened to ",
    emphasis: item.showTitle || "a show",
  };
}

function activityIcon(item: ActivityItem) {
  if (item.type === "played_song") return faMusic;
  if (item.type === "played_playlist") return faAlbumCollection;
  return faAlbum;
}

function activityHref(item: ActivityItem): string | null {
  if (item.type === "played_song" && item.showKey) {
    const song = encodeURIComponent(item.songTitle || "");
    return `/show/${encodeURIComponent(item.showKey)}${song ? `?song=${song}` : ""}`;
  }
  if (item.type === "played_show" && item.showKey) {
    return `/show/${encodeURIComponent(item.showKey)}`;
  }
  if (item.type === "played_playlist" && item.playlistId) {
    return `/playlists/${encodeURIComponent(item.playlistId)}`;
  }
  return null;
}

export default function YouPage() {
  const [items, setItems] = useState<ActivityItem[]>(() => readActivityFeed());
  const [menuOpen, setMenuOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const item of items) {
      const day = dayLabel(item.createdAt);
      const list = map.get(day) || [];
      list.push(item);
      map.set(day, list);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <main className="min-h-screen bg-[#080017] text-white">
      <div className="mx-auto w-full max-w-md px-6 pb-8 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
            Recent
          </h1>
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center text-[18px] text-white/70 hover:text-white"
            >
              <FontAwesomeIcon icon={faEllipsisVertical} />
            </button>
            {menuOpen ? (
              <div className="absolute top-9 right-0 z-10 min-w-[170px] rounded-[10px] border border-white/15 bg-[#110428]/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur">
                <button
                  type="button"
                  className="w-full rounded-[8px] px-3 py-2 text-left text-[12px] text-white/90 hover:bg-white/10"
                  onClick={() => {
                    clearActivityFeed();
                    setItems([]);
                    setMenuOpen(false);
                  }}
                >
                  Clear recent activity
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[16px] border border-white/20 bg-white/5 p-4 text-sm text-white/70">
            No activity yet. Play a show, playlist, or song to start your feed.
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(([day, dayItems]) => (
              <section key={day}>
                <div className="mb-3 text-[16px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                  {day}
                </div>
                <div className="space-y-2.5">
                  {dayItems.map((item) => {
                    const href = activityHref(item);
                    const parts = activityParts(item);
                    const content = (
                      <div className="flex items-start gap-3 text-[14px] leading-[1.35] text-[#d5d5d5] [font-family:var(--font-roboto-condensed)]">
                        <div className="mt-[1px] w-4 shrink-0 text-center text-[13px] text-white/50">
                          <FontAwesomeIcon icon={activityIcon(item)} />
                        </div>
                        <p className="min-w-0">
                          <span>{parts.lead}</span>
                          <span className="font-semibold text-[#7f58f4]">{parts.emphasis}</span>
                          {parts.tail ? <span>{parts.tail}</span> : null}
                        </p>
                      </div>
                    );
                    if (!href) return <div key={item.id}>{content}</div>;
                    return (
                      <Link key={item.id} href={href} className="block hover:opacity-95">
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
