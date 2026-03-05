"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clearActivityFeed, readActivityFeed, type ActivityItem } from "@/utils/activityFeed";

function formatWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityText(item: ActivityItem): string {
  if (item.type === "played_song") {
    const song = item.songTitle || "a song";
    const show = item.showTitle || "a show";
    return `Listened to ${song} from ${show}`;
  }
  if (item.type === "played_playlist") {
    return `Listened to playlist ${item.playlistName || "Untitled playlist"}`;
  }
  return `Listened to ${item.showTitle || "a show"}`;
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

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const item of items) {
      const day = new Date(item.createdAt).toDateString();
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
            You
          </h1>
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1.5 text-[12px] text-white/85 hover:bg-white/10"
            onClick={() => {
              clearActivityFeed();
              setItems([]);
            }}
          >
            Clear
          </button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[16px] border border-white/20 bg-white/5 p-4 text-sm text-white/70">
            No activity yet. Play a show, playlist, or song to start your feed.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, dayItems]) => (
              <section key={day}>
                <div className="mb-2 text-[12px] text-white/55 [font-family:var(--font-roboto-condensed)]">
                  {day}
                </div>
                <div className="space-y-2">
                  {dayItems.map((item) => {
                    const href = activityHref(item);
                    const content = (
                      <div className="rounded-[16px] border border-white/20 bg-white/5 p-3">
                        <div className="text-[14px] text-white [font-family:var(--font-roboto-condensed)]">
                          {activityText(item)}
                        </div>
                        <div className="mt-1 text-[12px] text-white/60">{formatWhen(item.createdAt)}</div>
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
