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

function chartColorAt(index: number): string {
  const palette = [
    "#7F58F4",
    "#6332E4",
    "#9D7BFF",
    "#4E24C7",
    "#B79FFF",
    "#5A22C9",
    "#8A6BFF",
    "#3B179A",
    "#A88EF9",
    "#6A47E8",
  ];
  return palette[index % palette.length];
}

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
  const showChart = useMemo(() => {
    const showEvents = items.filter((item) => item.type === "played_show" || item.type === "played_song");
    const counts = new Map<string, { label: string; count: number }>();
    let unknown = 0;
    for (const item of showEvents) {
      const key = String(item.showKey || "").trim();
      const label = String(item.showTitle || "").trim();
      if (!key && !label) {
        unknown += 1;
        continue;
      }
      const mapKey = key || label;
      const current = counts.get(mapKey);
      if (current) {
        current.count += 1;
        if (!current.label && label) current.label = label;
        continue;
      }
      counts.set(mapKey, { label: label || "Unknown show", count: 1 });
    }
    const entries = Array.from(counts.values())
      .map((entry) => ({ show: entry.label, count: entry.count }))
      .sort((a, b) => b.count - a.count);
    if (unknown > 0) entries.push({ show: "Unknown show", count: unknown });
    const total = entries.reduce((sum, row) => sum + row.count, 0);
    return {
      total,
      entries: entries.map((row, index) => ({
        ...row,
        percent: total > 0 ? (row.count / total) * 100 : 0,
        color: row.show === "Unknown show" ? "#534B65" : chartColorAt(index),
      })),
    };
  }, [items]);
  const donutBackground = useMemo(() => {
    if (showChart.total <= 0) return "conic-gradient(#2B2341 0deg 360deg)";
    let acc = 0;
    const slices = showChart.entries.map((entry) => {
      const start = acc;
      const end = acc + (entry.count / showChart.total) * 360;
      acc = end;
      return `${entry.color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(${slices.join(", ")})`;
  }, [showChart]);

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
        <section className="mb-7 rounded-[16px] border border-white/10 bg-[rgba(21,9,49,0.72)] p-4">
          <div className="mb-3 text-[15px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
            Show Listening Mix
          </div>
          <div className="flex items-center gap-4">
            <div
              className="relative h-[148px] w-[148px] shrink-0 rounded-full"
              style={{ background: donutBackground }}
              aria-label="Studio album listening donut chart"
            >
              <div className="absolute inset-[24px] flex flex-col items-center justify-center rounded-full bg-[#12052B] text-center">
                <div className="text-[28px] font-semibold leading-none">
                  {showChart.total}
                </div>
                <div className="mt-1 text-[11px] text-white/65">Show Plays</div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {showChart.entries.length === 0 ? (
                <div className="text-[12px] text-white/65">
                  Start playing shows to populate this chart.
                </div>
              ) : (
                showChart.entries.slice(0, 6).map((entry) => (
                  <div key={entry.show} className="flex items-center justify-between gap-2 text-[12px]">
                    <div className="flex min-w-0 items-center gap-2 text-white/80">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="truncate">{entry.show}</span>
                    </div>
                    <span className="shrink-0 text-white/70">{entry.percent.toFixed(0)}%</span>
                  </div>
                ))
              )}
              {showChart.entries.length > 6 ? (
                <div className="pt-1 text-[11px] text-white/55">
                  +{showChart.entries.length - 6} more shows
                </div>
              ) : null}
            </div>
          </div>
        </section>

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
