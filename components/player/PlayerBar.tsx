"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBackwardStep,
  faEye,
  faForwardStep,
  faPause,
  faPlay,
} from "@fortawesome/pro-solid-svg-icons";
import { usePlayer } from "@/components/player/store";
import { toDisplayTrackTitle } from "@/utils/displayTitle";

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatCardDate(input?: string): string {
  const raw = String(input || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const yy = m[1].slice(2);
  const mm = String(Number(m[2]));
  const dd = String(Number(m[3]));
  return `${mm}-${dd}-${yy}`;
}

function getArchiveIdentifier(url?: string): string {
  const clean = String(url || "");
  if (!clean) return "";
  const match = clean.match(/\/download\/([^/]+)\//i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function PlayerBar() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackTriedRef = useRef<Set<string>>(new Set());

  const playerState = usePlayer() as unknown as {
    queue: Array<{
      title: string;
      url: string;
      track?: string;
      showKey?: string;
      showDate?: string;
      venueText?: string;
      artwork?: string;
    }>;
    index: number;
    playing: boolean;
    setQueue: (
      queue: Array<{
        title: string;
        url: string;
        track?: string;
        showKey?: string;
        showDate?: string;
        venueText?: string;
        artwork?: string;
      }>,
      startIndex?: number,
    ) => void;
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
  const nextTrack = hasQueue && queue.length > 1 ? queue[(index + 1) % queue.length] : null;
  const nextSrc = nextTrack?.url || "";
  const subtitle = useMemo(() => {
    if (!currentTrack) return "";
    const venue = String(currentTrack.venueText || "").trim();
    const date = formatCardDate(currentTrack.showDate);
    return [venue, date].filter(Boolean).join(" ");
  }, [currentTrack]);
  const artworkSrc = useMemo(() => {
    if (!currentTrack) return "";
    if (currentTrack.artwork) return currentTrack.artwork;
    const identifier = getArchiveIdentifier(currentTrack.url);
    if (!identifier) return "";
    return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
  }, [currentTrack]);

  function openCurrentShow() {
    setMinimized(false);
    if (!currentTrack?.showKey) return;
    const song = encodeURIComponent(toDisplayTrackTitle(currentTrack.title));
    router.push(`/show/${encodeURIComponent(currentTrack.showKey)}?song=${song}`);
  }

  function toMp3FallbackUrl(url: string): string {
    const clean = String(url || "");
    if (!clean) return "";
    // Common demo/source URLs are FLAC; try same path with MP3 as a pragmatic fallback.
    return clean.replace(/\.flac(\?.*)?$/i, ".mp3$1");
  }

  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [minimized, setMinimized] = useState(false);

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
    fallbackTriedRef.current.delete(src);

    if (playing) {
      audio.play().catch((err) => {
        console.error("play() blocked/failed:", err);
      });
    }
  }, [src]);

  // Warm the next track in a hidden audio element to reduce gap between songs.
  useEffect(() => {
    const preloadAudio = preloadAudioRef.current;
    if (!preloadAudio) return;
    if (!nextSrc || nextSrc === src) {
      preloadAudio.removeAttribute("src");
      preloadAudio.load();
      return;
    }
    preloadAudio.src = nextSrc;
    preloadAudio.preload = "auto";
    preloadAudio.load();
  }, [nextSrc, src]);

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

  function onPrevPress() {
    const audio = audioRef.current;
    // First press while the current song has progressed: restart same song.
    // A second press (now near 0:00) moves to the previous song.
    if (audio && Number.isFinite(audio.currentTime) && audio.currentTime > 0.75) {
      audio.currentTime = 0;
      setCurrent(0);
      return;
    }
    prev?.();
  }

  const title = useMemo(() => {
    if (!currentTrack) return "—";
    const baseTitle = toDisplayTrackTitle(currentTrack.title);
    return currentTrack.track
      ? `${currentTrack.track}. ${baseTitle}`
      : baseTitle;
  }, [currentTrack]);

  if (!hasQueue) return null;

  const audioElements = (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={(e) => setCurrent((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration || 0)}
        onEnded={() => next?.()}
        onError={() => {
          const a = audioRef.current;
          if (!a || !src) return;

          const maybeMp3 = toMp3FallbackUrl(src);
          const canFallback =
            maybeMp3 &&
            maybeMp3 !== src &&
            /\.flac(\?.*)?$/i.test(src) &&
            !fallbackTriedRef.current.has(src);

          if (canFallback) {
            fallbackTriedRef.current.add(src);
            a.src = maybeMp3;
            a.load();
            if (playing) {
              a.play().catch((err) => console.error("MP3 fallback play() failed:", err));
            }
            return;
          }
          console.error("AUDIO ERROR", a?.error, a?.src);
        }}
      />
      <audio ref={preloadAudioRef} preload="auto" className="hidden" />
    </>
  );

  if (minimized) {
    return (
      <>
        {audioElements}
        <button
          type="button"
          onClick={openCurrentShow}
          className="fixed bottom-4 right-4 z-30 h-14 w-14 overflow-hidden rounded-xl border border-white/20 bg-black/80 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur"
          title={currentTrack?.showKey ? "Open current show" : "Show unavailable"}
        >
          {artworkSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
              Now
            </div>
          )}
        </button>
      </>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/80 backdrop-blur">
      <div className="mx-auto max-w-3xl p-3">
        {audioElements}

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

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
          {artworkSrc ? (
            <button
              type="button"
              onClick={openCurrentShow}
              className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/15 disabled:cursor-default"
              disabled={!currentTrack?.showKey}
              title={currentTrack?.showKey ? "Open current show" : "Show unavailable"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={artworkSrc} alt="" className="h-full w-full object-cover" />
            </button>
          ) : null}

          {/* Track title + show line */}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={openCurrentShow}
              disabled={!currentTrack?.showKey}
              className="block w-full min-w-0 text-left disabled:cursor-default"
              title={currentTrack?.showKey ? "Open current show" : "Show unavailable"}
            >
              <div className="truncate text-sm font-medium">{title}</div>
              {subtitle ? (
                <div className="mt-0.5 truncate text-xs text-white/60">{subtitle}</div>
              ) : null}
            </button>
          </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              onClick={onPrevPress}
              disabled={!hasQueue}
              title="Previous"
            >
              <FontAwesomeIcon icon={faBackwardStep} />
            </button>

            {playing ? (
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
                onClick={() => pause?.()}
                disabled={!hasQueue}
                title="Pause"
              >
                <FontAwesomeIcon icon={faPause} />
              </button>
            ) : (
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
                onClick={() => play?.()}
                disabled={!hasQueue}
                title="Play"
              >
                <FontAwesomeIcon icon={faPlay} />
              </button>
            )}

            <button
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              onClick={() => next?.()}
              disabled={!hasQueue}
              title="Next"
            >
              <FontAwesomeIcon icon={faForwardStep} />
            </button>

            <button
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
              onClick={() => setMinimized(true)}
              disabled={!hasQueue}
              title="Hide player"
            >
              <FontAwesomeIcon icon={faEye} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
