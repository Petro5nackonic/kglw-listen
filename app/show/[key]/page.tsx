"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePlayer } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";
import { formatDuration } from "@/utils/formatDuration";

type Source = {
  identifier: string;
  title: string;
  hint: "SBD" | "AUD" | "MATRIX" | "UNKNOWN";
  downloads: number;
  avg_rating: number;
  num_reviews: number;
  score: number;
};

type ShowApiResponse = {
  key: string;
  showDate: string;
  defaultId: string | null;
  sources: Source[];
};

type IaMetadataFile = {
  name: string;
  format?: string;
  title?: string;
  track?: string;
  length?: string;
};

type IaMetadataResponse = {
  metadata?: {
    title?: string;
    venue?: string;
    coverage?: string;
    description?: string;
  };
  files?: IaMetadataFile[];
};

const FAVORITE_SHOWS_KEY = "kglw.favoriteShows.v1";

function safeDecode(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function isAudioFile(name: string) {
  const n = name.toLowerCase();
  return (
    n.endsWith(".mp3") ||
    n.endsWith(".flac") ||
    n.endsWith(".ogg") ||
    n.endsWith(".m4a") ||
    n.endsWith(".wav")
  );
}

function audioExtRank(name: string): number {
  const n = name.toLowerCase();
  if (n.endsWith(".flac")) return 1;
  if (n.endsWith(".mp3")) return 2;
  if (n.endsWith(".m4a")) return 3;
  if (n.endsWith(".ogg")) return 4;
  if (n.endsWith(".wav")) return 5;
  return 999;
}

function trackSetRank(fileName: string): number {
  const n = fileName.toLowerCase();

  // Prefer edited/stereo mixes if present (common cause of duplicates).
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;

  // Neutral/default.
  if (
    n.includes("audience") ||
    n.includes("matrix") ||
    n.includes("soundboard")
  )
    return 3;

  // De-prioritize raw/original multi-channel captures.
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (
    n.includes("4ch") ||
    n.includes("4-ch") ||
    n.includes("4 channel") ||
    n.includes("4-channel")
  )
    return 12;

  return 5;
}

function parseTrackNum(t?: string) {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function lengthToSeconds(v?: string): number {
  if (!v) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Math.floor(Number(raw)));
  const parts = raw.split(":").map((p) => Number(p));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function compactDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

function venueFromTitle(title?: string): string {
  const t = String(title || "");
  const m = t.match(
    /live\s+(?:at|in)\s+(.+?)(?:\s+on\s+(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\(|$)/i,
  );
  return m?.[1]?.trim() || "";
}

export default function ShowPage({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    queue,
    index: playingIndex,
    playing,
    setQueue,
    setPlaying,
  } = usePlayer();
  const playlists = usePlaylists((s) => s.playlists);
  const addTrackToPlaylist = usePlaylists((s) => s.addTrack);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);

  // Primary: params.key (ideal)
  // Fallback: last segment of the URL (/show/<segment>)
  const showKey = useMemo(() => {
    const raw =
      (typeof params?.key === "string" ? params.key : undefined) ??
      (() => {
        const seg = (pathname || "").split("/").filter(Boolean).pop();
        return seg || "";
      })();

    return safeDecode(raw);
  }, [params, pathname]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [show, setShow] = useState<ShowApiResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [meta, setMeta] = useState<IaMetadataResponse | null>(null);
  const [focusedTrackIdx, setFocusedTrackIdx] = useState<number | null>(null);
  const trackRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [sheetTrack, setSheetTrack] = useState<{
    title: string;
    url: string;
    length?: string;
    track: string;
  } | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [favoriteShows, setFavoriteShows] = useState<string[]>([]);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [playlistActionState, setPlaylistActionState] = useState<
    Record<string, "added" | "exists" | undefined>
  >({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITE_SHOWS_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setFavoriteShows(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFavoriteShows([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);
      setShow(null);
      setSelectedId(null);
      setMeta(null);

      // Guard: if we still don't have a key, show a real error instead of calling API with undefined
      if (!showKey || showKey === "undefined") {
        setError("Route param missing. Expected /show/<showKey>.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/ia/show?key=${encodeURIComponent(showKey)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`GET /api/ia/show failed: ${res.status}`);
        const data = (await res.json()) as ShowApiResponse;

        if (!alive) return;
        setShow(data);
        setSelectedId(data.defaultId ?? data.sources?.[0]?.identifier ?? null);
      } catch (e: unknown) {
        if (!alive) return;
        if (e instanceof Error) setError(e.message);
        else setError("Failed to load show");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [showKey]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!selectedId) return;
      setMeta(null);

      try {
        const res = await fetch(
          `https://archive.org/metadata/${encodeURIComponent(selectedId)}`,
          { cache: "no-store" },
        );
        if (!res.ok)
          throw new Error(`GET archive metadata failed: ${res.status}`);
        const data = (await res.json()) as IaMetadataResponse;

        if (!alive) return;
        setMeta(data);
      } catch (e: unknown) {
        if (!alive) return;
        if (e instanceof Error) setError(e.message);
        else setError("Failed to load archive metadata");
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const tracks = useMemo(() => {
    if (!selectedId) return [];
    const files = meta?.files ?? [];
    const audioAll = files.filter((f) => f?.name && isAudioFile(f.name));
    if (audioAll.length === 0) return [];

    // Pick a single track set (e.g., Edited vs OG) to avoid duplicates.
    const bestSetRank = Math.min(...audioAll.map((f) => trackSetRank(f.name)));
    const audioSet = audioAll.filter(
      (f) => trackSetRank(f.name) === bestSetRank,
    );

    // Prefer a single format (FLAC > MP3 > ...), since IA often includes multiple encodes.
    const bestExtRank = Math.min(...audioSet.map((f) => audioExtRank(f.name)));
    const audio = audioSet.filter((f) => audioExtRank(f.name) === bestExtRank);

    audio.sort((a, b) => {
      const ta = parseTrackNum(a.track);
      const tb = parseTrackNum(b.track);
      if (ta !== tb) return ta - tb;
      return (a.name || "").localeCompare(b.name || "");
    });

    // De-dupe identical songs when multiple copies remain.
    const seen = new Set<string>();
    const out: { title: string; length?: string; url: string }[] = [];
    for (const f of audio) {
      const title = f.title || f.name;
      const key = `${title.toLowerCase()}|${f.length || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = `https://archive.org/download/${encodeURIComponent(selectedId)}/${encodeURIComponent(f.name)}`;
      out.push({ title, length: formatDuration(f.length), url });
    }

    return out;
  }, [meta, selectedId]);

  const requestedSong = useMemo(() => {
    return (searchParams?.get("song") || "").trim().toLowerCase();
  }, [searchParams]);

  useEffect(() => {
    if (!requestedSong) return;
    if (tracks.length === 0) return;

    const normalize = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const needle = normalize(requestedSong);
    if (!needle) return;

    const idx = tracks.findIndex((t) => normalize(t.title).includes(needle));
    if (idx < 0) return;

    setFocusedTrackIdx(idx);
    const el = trackRefs.current[idx];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    const timer = setTimeout(() => setFocusedTrackIdx(null), 4000);
    return () => clearTimeout(timer);
  }, [requestedSong, tracks]);

  const showDate = show?.showDate || showKey.split("|")[0] || "";
  const selectedSource = show?.sources?.find((s) => s.identifier === selectedId) || null;
  const heroImage = selectedId
    ? `https://archive.org/services/img/${encodeURIComponent(selectedId)}`
    : "";
  const rawShowTitle =
    meta?.metadata?.title || selectedSource?.title || showKey || "";
  const venueText =
    meta?.metadata?.venue ||
    venueFromTitle(rawShowTitle) ||
    venueFromTitle(selectedSource?.title) ||
    "Unknown venue";
  const totalSeconds = useMemo(
    () => tracks.reduce((sum, t) => sum + lengthToSeconds(t.length), 0),
    [tracks],
  );
  const taperText = String(meta?.metadata?.description || "")
    .match(/taper(?:s)?\s*:\s*([^\n<]+)/i)?.[1]
    ?.trim();
  const sourceLine = selectedSource?.hint || "UNKNOWN";
  const isFavoriteShow = favoriteShows.includes(showKey);

  function closeSheet() {
    setSheetTrack(null);
    setShowPlaylistPicker(false);
    setNewPlaylistName("");
    setShareState("idle");
    setPlaylistActionState({});
  }

  function persistFavoriteShows(next: string[]) {
    setFavoriteShows(next);
    try {
      localStorage.setItem(FAVORITE_SHOWS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  }

  return (
    <main className="min-h-screen bg-[#080017] text-white [font-family:var(--font-roboto)]">
      <div className="relative h-[220px] w-full overflow-hidden">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt=""
            className="h-full w-full object-cover opacity-35"
          />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-b from-[#120028]/60 via-[#100020]/75 to-[#080017]" />

        <div className="absolute inset-x-0 top-0 mx-auto w-full max-w-md px-6 pt-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-white/80 hover:text-white text-lg">
              ←
            </Link>
            <span className="text-sm text-white/60">⋮</span>
          </div>

          <div className="mt-7 text-center [font-family:var(--font-roboto-condensed)]">
            <div className="text-[36px] leading-none font-medium tracking-tight">
              {showDate || "(no date)"}
            </div>
            <div className="mt-1 text-[14px] text-white/70">{venueText}</div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[12px] [font-family:var(--font-roboto)]">
              <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
              Bootleg Gizzard
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mx-auto max-w-md px-6 py-8 text-sm text-white/60">
          Loading show…
        </div>
      ) : error ? (
        <div className="mx-auto mt-6 max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 whitespace-pre-wrap">
          {error}
        </div>
      ) : !show ? (
        <div className="mx-auto max-w-md px-6 py-8 text-sm text-white/60">
          No show data returned.
        </div>
      ) : show.sources.length === 0 ? (
        <div className="mx-auto mt-6 max-w-md rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70 whitespace-pre-wrap">
          No sources found for this show.
        </div>
      ) : (
        <div className="mx-auto -mt-8 max-w-md px-6 pb-8">
          <section className="mb-3 rounded-2xl border border-white/20 bg-white/6 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[28px] leading-none font-medium [font-family:var(--font-roboto-condensed)]">
                  {showDate}
                </div>
                <div className="mt-2 text-[15px] text-white/85 tracking-wide">
                  {venueText}
                </div>
                <div className="mt-2 text-[12px] text-white/65">
                  {tracks.length} Tracks • {compactDuration(totalSeconds)}
                </div>
              </div>
              <button
                type="button"
                className={`text-xl ${isFavoriteShow ? "text-fuchsia-400" : "text-white/70"}`}
                onClick={() => {
                  if (isFavoriteShow) {
                    persistFavoriteShows(favoriteShows.filter((k) => k !== showKey));
                  } else {
                    persistFavoriteShows([showKey, ...favoriteShows].slice(0, 400));
                  }
                }}
                aria-label={isFavoriteShow ? "Unfavorite show" : "Favorite show"}
                title={isFavoriteShow ? "Unfavorite show" : "Favorite show"}
              >
                ♥
              </button>
            </div>
          </section>

          <section className="mb-5 rounded-2xl border border-white/20 bg-white/3 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {taperText ? (
                  <div className="truncate text-sm text-white/70">
                    <span className="text-white/55">Taper(s): </span>
                    {taperText}
                  </div>
                ) : null}
                <div className="mt-1 text-sm text-white/70">
                  <span className="text-white/55">Source: </span>
                  {sourceLine}
                </div>
              </div>
              <span className="text-white/60">⋮</span>
            </div>

            <div className="mt-3">
              <select
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
                value={selectedId ?? ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                }}
              >
                {show.sources.map((s) => (
                  <option key={s.identifier} value={s.identifier}>
                    {s.hint} • {s.downloads.toLocaleString()} dl •{" "}
                    {toDisplayTitle(s.title).slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-2">
              {tracks.map((t, idx) => {
                const currentUrl = queue?.[playingIndex]?.url;
                const isCurrent = Boolean(currentUrl && currentUrl === t.url);
                const rightLabel = isCurrent
                  ? playing
                    ? "Playing"
                    : "Paused"
                  : "Play";

                const trackForPlaylist = {
                  title: toDisplayTrackTitle(t.title),
                  url: t.url,
                  length: t.length,
                  track: String(idx + 1),
                };

                return (
                  <div
                    key={t.url}
                    ref={(el) => {
                      trackRefs.current[idx] = el;
                    }}
                    className={`w-full transition flex items-center justify-between gap-3 rounded-2xl border border-white/14 px-2 py-1 ${
                      isCurrent ? "bg-white/10 border-fuchsia-300/40" : "bg-white/4 hover:bg-white/7"
                    } ${
                      focusedTrackIdx === idx
                        ? "bg-fuchsia-500/10 ring-1 ring-fuchsia-400/60 ring-inset"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // Always set the full show as the queue so it can auto-advance.
                        setQueue(
                          tracks.map((x, i) => ({
                            title: toDisplayTrackTitle(x.title),
                            url: x.url,
                            length: x.length,
                            track: String(i + 1),
                          })),
                          idx,
                        );

                        // If user clicked the currently playing track, treat as toggle.
                        // (Queue replace above keeps behavior consistent across sources.)
                        if (isCurrent) setPlaying(!playing);
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left rounded-xl px-2 py-2.5"
                    >
                      <div className="min-w-0 flex flex-1 items-center gap-3">
                        <span className="shrink-0 text-sm text-white/45 w-5 text-right">
                          {idx + 1}
                        </span>
                        <span className="truncate text-[20px] leading-none [font-family:var(--font-roboto-condensed)]">
                          {toDisplayTrackTitle(t.title)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {t.length ? (
                          <span className="text-[13px] text-white/75 tracking-wide">
                            {t.length}
                          </span>
                        ) : null}
                      </div>
                    </button>

                    <button
                      type="button"
                      className="shrink-0 rounded-md px-2 py-1 text-white/55 hover:text-white hover:bg-white/10 transition"
                      title="Track options"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSheetTrack(trackForPlaylist);
                        setShowPlaylistPicker(false);
                        setShareState("idle");
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                );
              })}

              {meta && tracks.length === 0 && (
                <div className="p-4 text-sm text-white/70">
                  No audio tracks found for this source.
                </div>
              )}
          </section>
        </div>
      )}

      {sheetTrack && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => closeSheet()}
        >
          <div
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[393px] rounded-t-2xl border border-white/15 bg-[#080017] px-6 pb-10 pt-6 shadow-[0_-4px_16px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            {!showPlaylistPicker ? (
              <>
                <div className="mb-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="truncate text-[22px] leading-none">
                      {toDisplayTrackTitle(sheetTrack.title)}
                    </div>
                    <div className="text-sm text-white/85">
                      {sheetTrack.length || "—"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-white/45">
                    <div className="min-w-0 truncate">
                      pin {venueText}
                    </div>
                    <div className="shrink-0">{showDate}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl bg-[rgba(48,26,89,0.25)] px-4 py-4 text-base hover:bg-[rgba(72,36,124,0.35)] transition"
                      onClick={() => {
                        if (isFavoriteShow) {
                          persistFavoriteShows(favoriteShows.filter((k) => k !== showKey));
                        } else {
                          persistFavoriteShows([showKey, ...favoriteShows].slice(0, 400));
                        }
                      }}
                    >
                      <span>{isFavoriteShow ? "★" : "♡"}</span>
                      <span>{isFavoriteShow ? "Favorited show" : "Favorite show"}</span>
                    </button>

                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl bg-[rgba(48,26,89,0.25)] px-4 py-4 text-base hover:bg-[rgba(72,36,124,0.35)] transition"
                      onClick={async () => {
                        try {
                          const songName = toDisplayTrackTitle(sheetTrack.title);
                          const songUrl = `${window.location.origin}/show/${encodeURIComponent(showKey)}?song=${encodeURIComponent(songName)}`;
                          await navigator.clipboard.writeText(songUrl);
                          setShareState("copied");
                          setTimeout(() => setShareState("idle"), 1500);
                        } catch {
                          setShareState("error");
                          setTimeout(() => setShareState("idle"), 1500);
                        }
                      }}
                    >
                      <span>➤</span>
                      <span>
                        Share
                        {shareState === "copied" ? " • copied" : ""}
                        {shareState === "error" ? " • failed" : ""}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-xl bg-[rgba(48,26,89,0.25)] px-4 py-4 text-base hover:bg-[rgba(72,36,124,0.35)] transition"
                    onClick={() => setShowPlaylistPicker(true)}
                  >
                    + Add to playlist(s)
                  </button>
                </div>

                <button
                  type="button"
                  className="mt-5 w-full text-center text-[20px] text-white/90 hover:text-white transition"
                  onClick={() => closeSheet()}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="mb-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="text-base text-white/70 hover:text-white"
                    onClick={() => setShowPlaylistPicker(false)}
                  >
                    ←
                  </button>
                  <div className="min-w-0 text-center flex-1">
                    <div className="truncate text-base font-medium">
                      {toDisplayTrackTitle(sheetTrack.title)}
                    </div>
                    <div className="truncate text-xs text-white/50">{venueText}</div>
                  </div>
                  <button
                    type="button"
                    className="text-base text-white/70 hover:text-white"
                    onClick={() => closeSheet()}
                  >
                    ✕
                  </button>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <div className="mx-auto text-sm text-white/75">Select playlist(s)</div>
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15 transition"
                    onClick={() => {
                      const id = createPlaylist(newPlaylistName || "New playlist");
                      addTrackToPlaylist(id, sheetTrack);
                      setPlaylistActionState((prev) => ({ ...prev, [id]: "added" }));
                      closeSheet();
                      router.push(`/playlists/${id}`);
                    }}
                  >
                    New +
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                  {playlists.length > 0 ? (
                    <div className="mb-2 max-h-56 space-y-2 overflow-auto">
                      {playlists.map((p) => {
                        const canonical = toDisplayTrackTitle(
                          sheetTrack.title,
                        ).toLowerCase();
                        const slot = p.slots.find(
                          (s) => s.canonicalTitle === canonical,
                        );
                        const alreadyExact = Boolean(
                          slot?.variants.some((v) => v.track.url === sheetTrack.url),
                        );
                        const actionState = playlistActionState[p.id];
                        const tracksCount = p.slots.length;
                        const versionsCount = p.slots.reduce(
                          (sum, s) => sum + s.variants.length,
                          0,
                        );
                        const linksCount = p.slots.filter(
                          (s) => s.variants.length > 1,
                        ).length;
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl border border-white/10 bg-white/3 px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm">{p.name}</div>
                                <div className="mt-0.5 text-[11px] text-white/50">
                                  {tracksCount} Tracks • {versionsCount} Versions •{" "}
                                  {linksCount} Links
                                </div>
                              </div>

                              {alreadyExact ? (
                                <span className="text-xs text-emerald-300">
                                  Added!
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15 transition"
                                  onClick={() => {
                                    const out = addTrackToPlaylist(
                                      p.id,
                                      sheetTrack,
                                    );
                                    setPlaylistActionState((prev) => ({
                                      ...prev,
                                      [p.id]: out === "exists" ? "exists" : "added",
                                    }));
                                  }}
                                >
                                  {actionState === "added" ? "Added!" : "Add"}
                                </button>
                              )}
                            </div>

                            {slot && !alreadyExact && (
                              <div className="mt-1 text-[11px] text-white/50">
                                {toDisplayTrackTitle(sheetTrack.title)} is already on
                                this playlist. Add will merge versions.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-2 py-1 text-xs text-white/60">
                      No playlists yet. Create one:
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="mt-5 w-full text-center text-[20px] text-white/90 hover:text-white transition"
                  onClick={() => setShowPlaylistPicker(false)}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
