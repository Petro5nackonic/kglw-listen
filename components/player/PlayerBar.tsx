"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/player/store";
import { toDisplayTrackTitle } from "@/utils/displayTitle";

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playerState = usePlayer() as unknown as {
    queue: Array<{ title: string; url: string; track?: string }>;
    index: number;
    playing: boolean;
    setQueue: (queue: Array<{ title: string; url: string; track?: string }>, startIndex?: number) => void;
    play?: () => void;
    pause?: () => void;
    next?: () => void;
    prev?: () => void;
  };
  const {
    queue,
    index,
    playing,
    setQueue,
    play,
    pause,
    next,
    prev,
  } = playerState;

  const hasQueue = Array.isArray(queue) && queue.length > 0;
  const currentTrack = hasQueue ? queue[index] : null;

  const src = currentTrack?.url || "";

  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // Keep audio element in sync when source changes.
  // Important: do not depend on `playing` here, or pause/play toggles
  // will reload the source and reset currentTime to 0.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!src) {
      audio.removeAttribute("src");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrent(0);
      setDuration(0);
      return;
    }

    audio.src = src;
    audio.load();
    setCurrent(0);

    if (playing) {
      audio.play().catch((err) => {
        console.error("play() blocked/failed:", err);
      });
    }
  }, [src]);

  // If user pauses/plays without changing src
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!src) return;

    if (playing) {
      audio.play().catch((err) => console.error("play() blocked/failed:", err));
    } else {
      audio.pause();
    }
  }, [playing, src]);

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Number(e.target.value);
    audio.currentTime = v;
    setCurrent(v);
  }

  const title = useMemo(() => {
    if (!currentTrack) return "—";
    const baseTitle = toDisplayTrackTitle(currentTrack.title);
    return currentTrack.track
      ? `${currentTrack.track}. ${baseTitle}`
      : baseTitle;
  }, [currentTrack]);

  if (!hasQueue) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/80 backdrop-blur">
      <div className="mx-auto max-w-3xl p-3">
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          onTimeUpdate={(e) => setCurrent((e.target as HTMLAudioElement).currentTime)}
          onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration || 0)}
          onEnded={() => next?.()}
          onError={() => {
            const a = audioRef.current;
            console.error("AUDIO ERROR", a?.error, a?.src);
          }}
        />

        {/* Full-width scrubber row (mobile friendly) */}
        <div className="mb-2 flex items-center gap-3 px-1">
          <div className="w-12 text-xs text-white/60 tabular-nums">{fmt(current)}</div>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={onScrub}
            disabled={!hasQueue || !duration}
            className="w-full accent-fuchsia-400 disabled:opacity-40"
          />

          <div className="w-12 text-right text-xs text-white/60 tabular-nums">
            {fmt(duration)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            onClick={() => prev?.()}
            disabled={!hasQueue}
            title="Previous"
          >
            ◀◀
          </button>

          {playing ? (
            <button
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              onClick={() => pause?.()}
              disabled={!hasQueue}
              title="Pause"
            >
              ❚❚
            </button>
          ) : (
            <button
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              onClick={() => play?.()}
              disabled={!hasQueue}
              title="Play"
            >
              ▶
            </button>
          )}

          <button
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            onClick={() => next?.()}
            disabled={!hasQueue}
            title="Next"
          >
            ▶▶
          </button>

          {/* Track title */}
          <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          </div>

          {/* Clear queue (optional) */}
          <button
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            onClick={() => setQueue?.([], 0)}
            disabled={!hasQueue}
            title="Clear"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
