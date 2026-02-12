"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePlayer } from "@/components/player/store";

type Track = {
  title: string;
  url: string;
  length?: string;
  track?: string;
  name?: string;
};

function archiveThumb(identifier: string) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

function toISODate(date?: string) {
  if (!date) return "Unknown date";
  return date.slice(0, 10);
}

function parseLengthToSeconds(len?: string) {
  if (!len) return 0;
  const s = String(len).trim();

  // "06:29" or "1:02:03"
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => Number(p));
    if (parts.some((n) => !Number.isFinite(n))) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  // seconds like "388.82"
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m${String(r).padStart(2, "0")}s`;
}

function fmtTrackTime(len?: string) {
  const sec = parseLengthToSeconds(len);
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { setQueue } = usePlayer();

  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    fetch(`/api/ia/item?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMeta(d);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  // ✅ Always define tracks, even during loading/invalid states (prevents conditional hooks)
  const tracks: Track[] = Array.isArray(meta?.tracks) ? meta.tracks : [];

  // ✅ Hook must run on every render, regardless of early returns
  const totalSeconds = useMemo(() => {
    if (!tracks.length) return 0;
    return tracks.reduce((sum, t) => sum + parseLengthToSeconds(t.length), 0);
  }, [tracks]);

  // Background (same as homepage)
  // (kept inside render so it always exists consistently)
  const bg = (
    <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.25),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(79,70,229,0.25),_transparent_55%),linear-gradient(180deg,_#05010b,_#05010b)]" />
  );

  if (loading) {
    return (
      <div className="pb-6">
        {bg}
        <div className="text-sm text-white/60">Loading show…</div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="pb-6">
        {bg}
        <div className="text-sm text-white/60">No metadata returned.</div>
      </div>
    );
  }

  if (!Array.isArray(meta.tracks)) {
    return (
      <div className="pb-6">
        {bg}
        <pre className="text-xs rounded-xl border border-white/10 bg-white/5 p-3 overflow-x-auto">
          Invalid tracks payload:
          {"\n"}
          {JSON.stringify(meta, null, 2)}
        </pre>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="pb-6">
        {bg}
        <div className="text-sm text-white/60">No playable tracks found.</div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {bg}

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0 opacity-60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={archiveThumb(id)}
            alt=""
            className="h-full w-full object-cover blur-sm scale-150"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        <div className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              ←
            </Link>

            <div className="text-right">
              <div className="text-xl font-bold">{toISODate(meta.date)}</div>
              <div className="text-sm text-white/70">{meta.venue || ""}</div>
              <div className="mt-2 inline-flex items-center gap-2 text-sm text-white/80">
                <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
                Bootleg Gizzard
              </div>
            </div>

            <div className="w-10" />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <div className="text-lg font-semibold">{toISODate(meta.date)}</div>
            <div className="text-sm text-white/70">{meta.venue || meta.title}</div>

            <div className="mt-2 text-sm text-white/70">
              {tracks.length} Tracks • {fmtDuration(totalSeconds)}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                onClick={() => setQueue(tracks, 0)}
              >
                Play
              </button>
              <button
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                onClick={() => setQueue(tracks, 0)}
              >
                Play all
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
        {tracks.map((t, i) => (
          <div
            key={t.url || `${i}`}
            className="flex items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
          >
            <div className="w-7 text-sm text-white/50 tabular-nums">
              {t.track || String(i + 1)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.title}</div>
            </div>

            <div className="w-14 text-right text-sm text-white/60 tabular-nums">
              {t.length ? fmtTrackTime(t.length) : ""}
            </div>

            <button
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
              onClick={() => setQueue(tracks, i)}
            >
              Play
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
