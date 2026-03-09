"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBackwardStep,
  faEyeSlash,
  faForwardStep,
  faListMusic,
  faMerge,
  faPause,
  faPlay,
  faStop,
} from "@fortawesome/pro-solid-svg-icons";
import { usePlayer } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
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

function formatCreatedDate(timestamp?: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTrackLengthLabel(length?: string): string {
  const raw = String(length || "").trim();
  if (!raw) return "";
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return fmt(Number(raw));
  }
  const parts = raw.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return raw;
  if (parts.length === 2) return fmt(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return fmt(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return raw;
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
  const playlists = usePlaylists((s) => s.playlists);
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
    length?: string;
    backupUrls?: string[];
    playlistId?: string;
    playlistSource?: "user" | "prebuilt";
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
      length?: string;
      backupUrls?: string[];
      playlistId?: string;
      playlistSource?: "user" | "prebuilt";
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
        length?: string;
        backupUrls?: string[];
        playlistId?: string;
        playlistSource?: "user" | "prebuilt";
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
    stop?: () => void;
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
    stop,
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
    if (venue && date) return `Live at ${venue} - ${date}`;
    if (venue) return `Live at ${venue}`;
    return date;
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
    if (
      currentTrack?.playlistSource === "prebuilt" &&
      currentTrack?.playlistId
    ) {
      router.push(`/playlists/${encodeURIComponent(currentTrack.playlistId)}`);
      return;
    }
    if (!currentTrack?.showKey) return;
    const params = new URLSearchParams();
    params.set("song", toDisplayTrackTitle(currentTrack.title));
    const identifier = getArchiveIdentifier(currentTrack.url);
    if (identifier) params.set("id", identifier);
    router.push(
      `/show/${encodeURIComponent(currentTrack.showKey)}?${params.toString()}`,
    );
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
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
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
    return toDisplayTrackTitle(currentTrack.title);
  }, [currentTrack]);
  const activePlaylist = useMemo(() => {
    const id = String(currentTrack?.playlistId || "").trim();
    if (!id) return null;
    return playlists.find((p) => p.id === id) || null;
  }, [currentTrack?.playlistId, playlists]);
  const isPrebuiltContext = Boolean(
    currentTrack?.playlistSource === "prebuilt" ||
      (activePlaylist &&
        (activePlaylist.source === "prebuilt" ||
          activePlaylist.prebuiltKind === "album-live-comp")),
  );
  const queueContextTitle = useMemo(() => {
    if (activePlaylist?.name) return activePlaylist.name;
    const venue = String(currentTrack?.venueText || "").trim();
    if (venue) return venue;
    return "Current Show";
  }, [activePlaylist, currentTrack?.venueText]);
  const queueContextSubtitle = useMemo(() => {
    if (activePlaylist) {
      if (isPrebuiltContext) return "";
      const created = formatCreatedDate(activePlaylist.createdAt);
      return created ? `Created ${created}` : "";
    }
    return formatCardDate(currentTrack?.showDate);
  }, [activePlaylist, isPrebuiltContext, currentTrack?.showDate]);
  const queueItems = useMemo(
    () =>
      queue
        .map((track, idx) => ({ track, idx }))
        .filter((item) => item.idx > index),
    [queue, index],
  );
  const currentVariantContext = useMemo(() => {
    const activeUrl = String(currentTrack?.url || "").trim();
    if (!activeUrl) return null;

    const preferredPlaylistId = String(currentTrack?.playlistId || "").trim();
    const playlistPool = preferredPlaylistId
      ? [
          ...playlists.filter((p) => p.id === preferredPlaylistId),
          ...playlists.filter((p) => p.id !== preferredPlaylistId),
        ]
      : playlists;

    for (const playlist of playlistPool) {
      const slot = playlist.slots.find((s) =>
        s.variants.some((variant) => String(variant.track?.url || "").trim() === activeUrl),
      );
      if (!slot) continue;

      const variants = slot.variants
        .map((variant) => variant.track)
        .filter((track) => Boolean(String(track?.url || "").trim()));
      if (variants.length < 2) continue;

      const currentVariantIndex = variants.findIndex(
        (variant) => String(variant.url || "").trim() === activeUrl,
      );
      if (currentVariantIndex < 0) continue;
      const alternateVariants = variants.filter((_, idx) => idx !== currentVariantIndex);
      if (alternateVariants.length === 0) continue;

      const resolvedSource = currentTrack?.playlistSource || playlist.source;
      return {
        variants,
        currentVariantIndex,
        playlistId: currentTrack?.playlistId || playlist.id,
        playlistSource:
          resolvedSource === "prebuilt" || resolvedSource === "user" ? resolvedSource : undefined,
      };
    }

    return null;
  }, [currentTrack, playlists]);

  function onNextVariantPress() {
    if (!currentVariantContext || !hasQueue || !currentTrack) return;
    const choices = currentVariantContext.variants.filter(
      (_, idx) => idx !== currentVariantContext.currentVariantIndex,
    );
    const randomized = choices[Math.floor(Math.random() * choices.length)];
    if (!randomized?.url) return;
    const nextQueue = queue.slice();
    nextQueue[index] = {
      ...currentTrack,
      ...randomized,
      playlistId: currentVariantContext.playlistId,
      playlistSource: currentVariantContext.playlistSource,
    };
    setQueue(nextQueue, index);
    if (!playing) {
      pause?.();
    }
  }

  useEffect(() => {
    if (hasQueue) return;
    setQueueSheetOpen(false);
  }, [hasQueue]);

  if (!hasQueue) return null;

  const canOpenCurrentContext = Boolean(
    (currentTrack?.playlistSource === "prebuilt" && currentTrack?.playlistId) ||
      currentTrack?.showKey,
  );

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
      {queueSheetOpen && (
        <>
          <button
            type="button"
            aria-label="Close queue"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setQueueSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[393px] rounded-t-2xl border border-white/15 bg-[#080017] px-6 pb-10 pt-6 shadow-[0_-4px_16px_rgba(0,0,0,0.4)] [font-family:var(--font-roboto-condensed)]">
            <div className="mb-5">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[8px] border border-white/15 bg-black/30">
                  {artworkSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artworkSrc} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[22px] leading-[1.05] text-white">
                    {queueContextTitle}
                  </div>
                  {queueContextSubtitle ? (
                    <div className="mt-1 text-[13px] text-white/65">{queueContextSubtitle}</div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="max-h-[50vh] space-y-1.5 overflow-auto pr-1">
              {currentTrack ? (
                <div className="flex items-center justify-between gap-2 rounded-lg px-1 py-1">
                  <div className="min-w-0 truncate text-[16px] leading-none text-[#EFD50F]">
                    {toDisplayTrackTitle(currentTrack.title)}
                  </div>
                  {currentTrack.length ? (
                    <span className="shrink-0 text-[14px] tracking-[0.04em] text-[#EFD50F]">
                      {formatTrackLengthLabel(currentTrack.length)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {queueItems.map((item) => {
                return (
                  <button
                    key={`${item.track.url}-${item.idx}`}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/6"
                    onClick={() => {
                      const nextQueue = queue.slice(item.idx);
                      if (nextQueue.length === 0) return;
                      setQueue(nextQueue, 0);
                      setQueueSheetOpen(false);
                    }}
                  >
                    <div className="min-w-0 truncate text-[16px] leading-none text-white">
                      {toDisplayTrackTitle(item.track.title)}
                    </div>
                    {item.track.length ? (
                      <span className="shrink-0 text-[14px] tracking-[0.04em] text-white/85">
                        {formatTrackLengthLabel(item.track.length)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {queueItems.length === 0 ? (
                <div className="text-[13px] text-white/60">No upcoming songs.</div>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-5 w-full text-center text-[16px] text-white/90 hover:text-white transition"
              onClick={() => setQueueSheetOpen(false)}
            >
              Close
            </button>
          </div>
        </>
      )}
      <div className="fixed right-0 bottom-[52px] left-0 z-30 bg-[#080017]/95 backdrop-blur">
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
                disabled={!canOpenCurrentContext}
                title={canOpenCurrentContext ? "Open current context" : "Show unavailable"}
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
                disabled={!canOpenCurrentContext}
                className="min-w-0 text-left disabled:cursor-default"
                title={canOpenCurrentContext ? "Open current context" : "Show unavailable"}
              >
                <div className="truncate text-[14px] text-white">{title}</div>
                {subtitle ? (
                  <div className="truncate text-[12px] text-white/60">{subtitle}</div>
                ) : null}
              </button>
            </div>
            <div className="flex items-center gap-3">
              {currentVariantContext ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[6px] bg-linear-to-r from-fuchsia-500/35 to-orange-400/30 px-[6px] py-[3px] text-[22px] text-white/95 hover:from-fuchsia-500/45 hover:to-orange-400/45 hover:text-white"
                  onClick={onNextVariantPress}
                  title="Next version"
                >
                  <FontAwesomeIcon icon={faMerge} className="text-[15px]" />
                  <FontAwesomeIcon icon={faForwardStep} className="text-[15px]" />
                </button>
              ) : null}
              <button
                type="button"
                className="text-[22px] text-white/95 hover:text-white disabled:opacity-40"
                onClick={() => setQueueSheetOpen(true)}
                disabled={!hasQueue}
                title="Queue"
              >
                <FontAwesomeIcon icon={faListMusic} />
              </button>
            </div>
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

          <div className="relative">
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
            <button
              type="button"
              className="absolute left-0 top-1/2 -translate-y-1/2 text-[19px] text-white/95 hover:text-white disabled:opacity-40"
              onClick={() => stop?.()}
              disabled={!hasQueue}
              title="Stop playback"
            >
              <FontAwesomeIcon icon={faStop} />
            </button>
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[19px] text-white/95 hover:text-white disabled:opacity-40"
              onClick={() => {
                setQueueSheetOpen(false);
                setMinimized(true);
              }}
              disabled={!hasQueue}
              title="Hide player"
            >
              <FontAwesomeIcon icon={faEyeSlash} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
