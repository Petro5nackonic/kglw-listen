"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBackwardStep,
  faEyeSlash,
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
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIdx = parts.findIndex((p) => /^(download|details|metadata)$/i.test(p));
    if (markerIdx >= 0 && parts[markerIdx + 1]) {
      return decodeURIComponent(parts[markerIdx + 1]);
    }
  } catch {
    // fall back to regex parsing below
  }
  const match = raw.match(/\/(?:download|details|metadata)\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function normalizeSearchText(input?: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyBrowserPlayableUrl(url?: string): boolean {
  const clean = String(url || "").toLowerCase();
  return (
    clean.endsWith(".mp3") ||
    clean.endsWith(".m4a") ||
    clean.endsWith(".ogg") ||
    clean.endsWith(".wav")
  );
}

function getFileNameFromUrl(url?: string): string {
  const clean = String(url || "");
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    const parts = parsed.pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "").toLowerCase();
  } catch {
    const parts = clean.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "").toLowerCase();
  }
}

function pickBestArchiveTrackUrl(
  candidates: Array<{ title?: string; name?: string; url?: string }>,
  preferredTitle: string,
  failingUrl: string,
): string {
  const titleToken = normalizeSearchText(preferredTitle);
  const failingName = getFileNameFromUrl(failingUrl).replace(/\.[a-z0-9]+$/i, "");
  let bestUrl = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const c of candidates) {
    const url = String(c?.url || "").trim();
    if (!url || !isLikelyBrowserPlayableUrl(url)) continue;
    const hay = normalizeSearchText(`${c?.title || ""} ${c?.name || ""}`);
    let score = 0;
    if (titleToken && hay.includes(titleToken)) score += 10;
    if (titleToken) {
      const parts = titleToken.split(" ").filter((p) => p.length >= 3);
      score += parts.reduce((sum, part) => (hay.includes(part) ? sum + 1 : sum), 0);
    }
    if (failingName && normalizeSearchText(c?.name || "").includes(normalizeSearchText(failingName))) {
      score += 4;
    }
    if (url.toLowerCase().endsWith(".mp3")) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}

export function PlayerBar() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackTriedRef = useRef<Set<string>>(new Set());
  const failedSourceRef = useRef<Set<string>>(new Set());
  const archiveResolvedRef = useRef<Map<string, string>>(new Map());
  const archiveLookupInFlightRef = useRef<Set<string>>(new Set());
  const loadedSrcRef = useRef("");
  const srcRef = useRef("");
  const playingRef = useRef(false);
  const currentTrackRef = useRef<{
    title: string;
    url: string;
    backupUrls?: string[];
    track?: string;
    showKey?: string;
    showDate?: string;
    venueText?: string;
    artwork?: string;
  } | null>(null);

  const playerState = usePlayer() as unknown as {
    queue: Array<{
      title: string;
      url: string;
      backupUrls?: string[];
      track?: string;
      showKey?: string;
      showDate?: string;
      venueText?: string;
      artwork?: string;
    }>;
    index: number;
    playing: boolean;
    loading: boolean;
    setQueue: (
      queue: Array<{
        title: string;
        url: string;
        backupUrls?: string[];
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
    setLoading?: (v: boolean) => void;
    next?: () => void;
    prev?: () => void;
  };
  const {
    queue,
    index,
    playing,
    loading,
    setQueue,
    play,
    pause,
    setLoading,
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

  function restorePlayer() {
    setMinimized(false);
  }

  function toAlternateArchiveAudioUrl(url: string): string {
    const clean = String(url || "");
    if (!clean) return "";
    if (/\.flac(\?.*)?$/i.test(clean)) {
      return clean.replace(/\.flac(\?.*)?$/i, ".mp3$1");
    }
    if (/\.mp3(\?.*)?$/i.test(clean)) {
      return clean.replace(/\.mp3(\?.*)?$/i, ".flac$1");
    }
    return "";
  }

  function tryFormatFallback(audio: HTMLAudioElement | null, currentSrc: string): boolean {
    if (!audio || !currentSrc) return false;
    const alternate = toAlternateArchiveAudioUrl(currentSrc);
    const canFallback =
      alternate &&
      alternate !== currentSrc &&
      !fallbackTriedRef.current.has(currentSrc);
    if (!canFallback) return false;
    fallbackTriedRef.current.add(currentSrc);
    audio.src = alternate;
    audio.load();
    if (playing) {
      audio.play().catch((err) => console.error("Format fallback play() failed:", err));
    }
    return true;
  }

  function tryBackupTrackSource(audio: HTMLAudioElement | null, currentSrc: string): boolean {
    if (!audio) return false;
    const backups = Array.isArray(currentTrack?.backupUrls) ? currentTrack.backupUrls : [];
    if (backups.length === 0) return false;
    failedSourceRef.current.add(currentSrc);
    const nextUrl = backups.find((u) => {
      const clean = String(u || "").trim();
      return Boolean(clean) && clean !== currentSrc && !failedSourceRef.current.has(clean);
    });
    if (!nextUrl) return false;
    audio.src = nextUrl;
    audio.load();
    if (playing) {
      audio.play().catch((err) => console.error("Backup source play() failed:", err));
    }
    return true;
  }

  function getFailingSrc(audio: HTMLAudioElement | null, fallback: string): string {
    const current = String(audio?.currentSrc || audio?.src || "").trim();
    return current || fallback;
  }

  function tryArchiveItemFallback(audio: HTMLAudioElement | null, failingSrc: string): boolean {
    const activeTrack = currentTrackRef.current;
    const identifier = getArchiveIdentifier(failingSrc || activeTrack?.url);
    if (!audio || !identifier || !activeTrack) return false;
    const cacheKey = `${identifier}|${normalizeSearchText(activeTrack.title)}`;
    const cached = archiveResolvedRef.current.get(cacheKey);
    if (cached && cached !== failingSrc && !failedSourceRef.current.has(cached)) {
      audio.src = cached;
      audio.load();
      if (playingRef.current) {
        audio.play().catch((err) => console.error("Cached archive fallback play() failed:", err));
      }
      return true;
    }
    if (archiveLookupInFlightRef.current.has(cacheKey)) return false;
    archiveLookupInFlightRef.current.add(cacheKey);
    void (async () => {
      let resolved = false;
      try {
        const res = await fetch(`/api/ia/item?id=${encodeURIComponent(identifier)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          tracks?: Array<{ title?: string; name?: string; url?: string }>;
        };
        const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
        const bestUrl = pickBestArchiveTrackUrl(tracks, activeTrack.title, failingSrc);
        if (!bestUrl || bestUrl === failingSrc || failedSourceRef.current.has(bestUrl)) return;
        archiveResolvedRef.current.set(cacheKey, bestUrl);
        const liveAudio = audioRef.current;
        if (!liveAudio) return;
        if (getArchiveIdentifier(srcRef.current) !== identifier) return;
        liveAudio.src = bestUrl;
        liveAudio.load();
        resolved = true;
        if (playingRef.current) {
          liveAudio.play().catch((err) => console.error("Archive fallback play() failed:", err));
        }
      } catch {
        // Ignore metadata lookup failures.
      } finally {
        archiveLookupInFlightRef.current.delete(cacheKey);
        if (!resolved && getArchiveIdentifier(srcRef.current) === identifier && playingRef.current) {
          // Keep playback moving if this source cannot be recovered.
          next?.();
        }
      }
    })();
    return true;
  }

  function tryRecoverCurrentTrack(audio: HTMLAudioElement | null, failingSrc: string): boolean {
    if (!audio || !failingSrc) return false;
    if (tryFormatFallback(audio, failingSrc)) return true;
    if (tryBackupTrackSource(audio, failingSrc)) return true;
    if (tryArchiveItemFallback(audio, failingSrc)) return true;
    return false;
  }

  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const progress = useMemo(() => {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const ratio = current / duration;
    if (!Number.isFinite(ratio)) return 0;
    return Math.max(0, Math.min(1, ratio));
  }, [current, duration]);
  useEffect(() => {
    srcRef.current = src;
  }, [src]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);
  useEffect(() => {
    setLoading?.(Boolean(playing && src && isBuffering));
  }, [isBuffering, playing, setLoading, src]);
  useEffect(() => {
    if (!isBuffering) {
      setBufferProgress(0);
      return;
    }
    setBufferProgress((prev) => (prev > 6 ? prev : 6));
    const timer = setInterval(() => {
      setBufferProgress((prev) => {
        if (prev >= 92) return 92;
        return Math.min(92, prev + 4);
      });
    }, 220);
    return () => clearInterval(timer);
  }, [isBuffering]);
  useEffect(() => {
    if (!isBuffering || !playing || !src) return;
    // Guardrail: if buffering never resolves, move on instead of freezing UI/audio.
    const timeout = setTimeout(() => {
      if (!playingRef.current) return;
      if (srcRef.current !== src) return;
      const audio = audioRef.current;
      const failingSrc = getFailingSrc(audio, src);
      if (tryRecoverCurrentTrack(audio, failingSrc)) {
        // Restart buffering watchdog for the newly attempted source.
        setIsBuffering(false);
        requestAnimationFrame(() => setIsBuffering(true));
        return;
      }
      setIsBuffering(false);
      next?.();
    }, 12000);
    return () => clearTimeout(timeout);
  }, [isBuffering, playing, src, next]);

  // Keep audio element in sync when source changes.
  // Important: do not depend on `playing` here, or pause/play toggles
  // will reload the source and reset currentTime to 0.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!src) {
      loadedSrcRef.current = "";
      audio.removeAttribute("src");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrent(0);
      setDuration(0);
      setIsBuffering(false);
      return;
    }
    if (loadedSrcRef.current === src) return;
    loadedSrcRef.current = src;

    audio.src = src;
    audio.load();
    setCurrent(0);
    fallbackTriedRef.current.delete(src);
    failedSourceRef.current.clear();

    if (playing) {
      setIsBuffering(true);
      audio.play().catch((err) => {
        const failingSrc = getFailingSrc(audio, src);
        if (tryRecoverCurrentTrack(audio, failingSrc)) return;
        setIsBuffering(false);
        console.error("play() blocked/failed:", err);
        next?.();
      });
    }
  }, [src, currentTrack, playing, next]);

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
      setIsBuffering(true);
      audio.play().catch((err) => {
        const failingSrc = getFailingSrc(audio, src);
        if (tryRecoverCurrentTrack(audio, failingSrc)) return;
        setIsBuffering(false);
        console.error("play() blocked/failed:", err);
        next?.();
      });
    } else {
      setIsBuffering(false);
      audio.pause();
    }
  }, [playing, src, next, currentTrack]);

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
        onTimeUpdate={(e) => {
          const t = (e.target as HTMLAudioElement).currentTime;
          setCurrent(t);
          if (t > 0) setIsBuffering(false);
        }}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration || 0)}
        onEnded={() => next?.()}
        onLoadStart={() => {
          if (playingRef.current) setIsBuffering(true);
        }}
        onWaiting={() => {
          if (playingRef.current) setIsBuffering(true);
        }}
        onStalled={() => {
          if (playingRef.current) setIsBuffering(true);
        }}
        onCanPlay={() => {
          if (!playingRef.current) return;
          setIsBuffering(false);
        }}
        onPlaying={() => {
          setIsBuffering(false);
        }}
        onError={() => {
          const a = audioRef.current;
          if (!a || !src) return;
          const failingSrc = getFailingSrc(a, src);
          if (tryRecoverCurrentTrack(a, failingSrc)) return;
          setIsBuffering(false);
          console.error("AUDIO ERROR", a?.error, a?.src);
          next?.();
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
          onClick={restorePlayer}
          className="fixed right-4 bottom-[68px] z-30 h-14 w-14 overflow-hidden rounded-xl border border-white/20 bg-black/80 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur"
          title="Restore player"
        >
          {artworkSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={artworkSrc} alt="" className="h-full w-full object-cover" />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `conic-gradient(from 0deg, rgba(0,0,0,0.45) 0deg ${progress * 360}deg, transparent ${progress * 360}deg 360deg)`,
                }}
              />
              <div
                className="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-[#EFD50F]/90"
                style={{ width: `${progress * 100}%` }}
              />
            </>
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
    <>
      {audioElements}
      <div className="fixed right-0 bottom-[52px] left-0 z-30 bg-black/65 backdrop-blur">
        <div className="mx-auto w-full max-w-[1140px] px-4 pb-4 pt-3 [font-family:var(--font-roboto-condensed)] md:px-6">
          {isBuffering && playing && src ? (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-white/70">
                <span>Loading audio...</span>
                <span>{Math.max(5, Math.floor(bufferProgress))}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-fuchsia-400 to-orange-400 transition-[width] duration-200"
                  style={{ width: `${Math.max(6, bufferProgress)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={openCurrentShow}
                className="h-[42px] w-[42px] shrink-0 overflow-hidden rounded-[8px] bg-[#d9d9d9] disabled:cursor-default"
                disabled={!currentTrack?.showKey}
                title={currentTrack?.showKey ? "Open current show" : "Show unavailable"}
              >
                {artworkSrc ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artworkSrc} alt="" className="h-full w-full object-cover" />
                  </>
                ) : null}
              </button>
              <button
                type="button"
                onClick={openCurrentShow}
                disabled={!currentTrack?.showKey}
                className="min-w-0 text-left disabled:cursor-default"
                title={currentTrack?.showKey ? "Open current show" : "Show unavailable"}
              >
                <div className="truncate text-[14px] text-white">{title}</div>
              </button>
            </div>
            <button
              type="button"
              className="text-[22px] text-white/95 hover:text-white disabled:opacity-40"
              onClick={() => setMinimized(true)}
              disabled={!hasQueue}
              title="Hide player"
            >
              <FontAwesomeIcon icon={faEyeSlash} />
            </button>
          </div>

          <div className="mb-3 flex items-center gap-3">
            <div className="w-9 text-[12px] text-white tabular-nums">{fmt(current)}</div>
            <div className="relative h-4 flex-1">
              <div className="absolute top-1/2 left-0 h-[4px] w-full -translate-y-1/2 rounded-[8px] bg-white/15" />
              <div
                className="absolute top-1/2 left-0 h-[4px] -translate-y-1/2 rounded-[8px] bg-fuchsia-400"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="pointer-events-none absolute top-1/2 z-10 h-[8px] w-[8px] -translate-y-1/2 rounded-full border border-fuchsia-300 bg-fuchsia-200 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ left: `calc(${progress * 100}% - 4px)` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(current, duration || 0)}
                onChange={onScrub}
                disabled={!hasQueue || !duration}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </div>
            <div className="w-9 text-right text-[12px] text-white tabular-nums">{fmt(duration)}</div>
          </div>

          <div className="flex items-center justify-center gap-12 text-[25px] text-white">
            <button
              className="leading-none disabled:opacity-40"
              onClick={onPrevPress}
              disabled={!hasQueue}
              title="Previous"
            >
              <FontAwesomeIcon icon={faBackwardStep} />
            </button>

            {playing ? (
              <button
                className="leading-none disabled:opacity-40"
                onClick={() => pause?.()}
                disabled={!hasQueue}
                title="Pause"
              >
                <FontAwesomeIcon icon={faPause} />
              </button>
            ) : (
              <button
                className="leading-none disabled:opacity-40"
                onClick={() => play?.()}
                disabled={!hasQueue}
                title="Play"
              >
                <FontAwesomeIcon icon={faPlay} className={loading ? "animate-pulse" : ""} />
              </button>
            )}

            <button
              className="leading-none disabled:opacity-40"
              onClick={() => next?.()}
              disabled={!hasQueue}
              title="Next"
            >
              <FontAwesomeIcon icon={faForwardStep} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
