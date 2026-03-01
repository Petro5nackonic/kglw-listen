"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePlayer } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";
import { formatDuration } from "@/utils/formatDuration";
import { shouldUseDefaultArtwork } from "@/utils/archiveArtwork";

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
const DEFAULT_ARTWORK_SRC = "/api/default-artwork";

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
          `/api/ia/show-metadata?id=${encodeURIComponent(selectedId)}`,
          { cache: "no-store" },
        );
        if (!res.ok)
          throw new Error(`GET /api/ia/show-metadata failed: ${res.status}`);
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
  const heroImageSrc = shouldUseDefaultArtwork(selectedId ?? undefined)
    ? DEFAULT_ARTWORK_SRC
    : heroImage;
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
      <div className="relative h-[250px] w-full overflow-hidden">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageSrc}
            alt=""
            className="h-full w-full object-cover opacity-12"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
              img.src = DEFAULT_ARTWORK_SRC;
            }}
          />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-b from-[#080017]/0 via-[#080017]/35 to-[#080017]" />

        <div className="absolute inset-x-0 top-0 mx-auto w-full max-w-[393px] px-6 pt-[67px]">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-white/90 hover:text-white text-[28px] leading-none">
              ←
            </Link>
            <button type="button" className="text-[20px] text-white/75">
              ⋮
            </button>
          </div>

          <div className="mt-3 text-center" />
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
        <div className="mx-auto -mt-[112px] w-full max-w-[393px] px-6 pb-8">
          <section className="mb-5">
            <div className="relative z-[2] rounded-2xl border border-white/20 bg-white/5 p-4 backdrop-blur-[6px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] text-white/90">{showDate}</div>
                  <div className="mt-1 text-[28px] leading-none font-medium [font-family:var(--font-roboto-condensed)]">
                    {toDisplayTitle(rawShowTitle)}
                  </div>
                </div>
                <button
                  type="button"
                  className={`inline-flex h-6 w-6 items-center justify-center ${isFavoriteShow ? "text-fuchsia-300" : "text-white/75"}`}
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
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v16.5l-6.5-4-6.5 4V5A1.5 1.5 0 0 1 7 3.5Z" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 text-[16px] tracking-[0.02em] text-white/95 [font-family:var(--font-roboto-condensed)]">
                {venueText}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[16px] text-white/85 [font-family:var(--font-roboto-condensed)]">
                <span>{tracks.length} Tracks</span>
                <span className="inline-block size-[4px] rounded-full bg-white/80" />
                <span>{compactDuration(totalSeconds)}</span>
              </div>
            </div>

            <div className="-mt-4 rounded-b-2xl border border-white/20 border-t-0 px-4 pb-3 pt-7">
              <select
                className="w-full rounded-xl bg-black/30 py-2 pr-3 text-sm"
                value={selectedId ?? ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                }}
              >
                {show.sources.map((s) => (
                  <option key={s.identifier} value={s.identifier}>
                    {s.hint} • {s.downloads.toLocaleString()} dl •{" "}
                    {(() => {
                      const v = toDisplayTitle(s.title);
                      return v.length > 60 ? `${v.slice(0, 57).trimEnd()}...` : v;
                    })()}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-1.5">
            {tracks.map((t, idx) => {
              const currentUrl = queue?.[playingIndex]?.url;
              const isCurrent = Boolean(currentUrl && currentUrl === t.url);

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
                  className={`flex items-center justify-between gap-2 rounded-lg px-1 py-1 transition ${
                    isCurrent ? "bg-white/10" : "hover:bg-white/6"
                  } ${focusedTrackIdx === idx ? "bg-fuchsia-500/10 ring-1 ring-fuchsia-400/50" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQueue(
                        tracks.map((x, i) => ({
                          title: toDisplayTrackTitle(x.title),
                          url: x.url,
                          length: x.length,
                          track: String(i + 1),
                        })),
                        idx,
                      );
                      if (isCurrent) setPlaying(!playing);
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-1 py-1 text-left"
                  >
                    <span className="truncate text-[16px] leading-none [font-family:var(--font-roboto-condensed)]">
                      {toDisplayTrackTitle(t.title)}
                    </span>
                    {t.length ? (
                      <span className="shrink-0 text-[14px] tracking-[0.04em] text-white/85 [font-family:var(--font-roboto-condensed)]">
                        {t.length}
                      </span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
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
