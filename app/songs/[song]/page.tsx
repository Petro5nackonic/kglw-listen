"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faCirclePlay,
  faEllipsisVertical,
  faSpinner,
} from "@fortawesome/pro-solid-svg-icons";
import { usePlayer, type Track } from "@/components/player/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";

type ShowItem = {
  showKey: string;
  showDate: string;
  title: string;
  artwork?: string;
  defaultId?: string;
  matchedSongTitle?: string | null;
  matchedSongLength?: string | null;
  matchedSongSeconds?: number | null;
  matchedSongUrl?: string | null;
};

type ShowsResponse = {
  items?: ShowItem[];
  song?: {
    total: number;
    items: ShowItem[];
  };
};
type SortMode = "newest" | "oldest" | "song_len_longest" | "song_len_shortest";

function isValidShowKey(showKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\|.+/.test(String(showKey || "").trim());
}

function formatCardDate(input: string): string {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return input;
  const yy = m[1].slice(2);
  const mm = String(Number(m[2]));
  const dd = String(Number(m[3]));
  return `${mm}-${dd}-${yy}`;
}

function uniqueByShowKey(items: ShowItem[]): ShowItem[] {
  const out: ShowItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.showKey || seen.has(item.showKey)) continue;
    seen.add(item.showKey);
    out.push(item);
  }
  return out;
}

function isAudioName(name: string): boolean {
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
  if (n.endsWith(".mp3")) return 1;
  if (n.endsWith(".m4a")) return 2;
  if (n.endsWith(".ogg")) return 3;
  if (n.endsWith(".wav")) return 4;
  if (n.endsWith(".flac")) return 5;
  return 999;
}

function trackSetRank(fileName: string): number {
  const n = fileName.toLowerCase();
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;
  if (n.includes("audience") || n.includes("matrix") || n.includes("soundboard")) return 3;
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel"))
    return 12;
  return 5;
}

function parseTrackNum(t?: string): number {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function normalizeSongText(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type IaMetadataFile = {
  name?: string;
  title?: string;
  track?: string;
  length?: string | number;
};

export default function SongVersionsPage() {
  const router = useRouter();
  const { setQueue } = usePlayer();
  const params = useParams<{ song?: string | string[] }>();
  const rawSong = Array.isArray(params?.song) ? params.song[0] : params?.song || "";
  const songQuery = useMemo(() => {
    try {
      return decodeURIComponent(rawSong);
    } catch {
      return rawSong;
    }
  }, [rawSong]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shows, setShows] = useState<ShowItem[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [requestedPlayShowKey, setRequestedPlayShowKey] = useState<string | null>(null);
  const queueByIdentifierRef = useRef<Record<string, Track[]>>({});
  const inFlightQueueByIdentifierRef = useRef<Record<string, Promise<Track[]>>>({});
  const resolvedShowIdsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!songQuery.trim()) {
        setShows([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const url = `/api/ia/shows?page=1&sort=newest&refresh=1&query=${encodeURIComponent(songQuery.trim())}`;
        let res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load song versions (${res.status})`);
        let data = (await res.json()) as ShowsResponse;
        const firstPassCount = Array.isArray(data.song?.items)
          ? data.song.items.length
          : Array.isArray(data.items)
            ? data.items.length
            : 0;
        if (firstPassCount === 0) {
          const retryUrl = `${url}&refresh=1`;
          res = await fetch(retryUrl, { cache: "no-store" });
          if (res.ok) data = (await res.json()) as ShowsResponse;
        }
        if (!alive) return;
        const unique = uniqueByShowKey(data.song?.items || data.items || []);
        unique.sort((a, b) => String(b.showDate || "").localeCompare(String(a.showDate || "")));
        setShows(unique);
      } catch (e: unknown) {
        if (!alive) return;
        setShows([]);
        setError(e instanceof Error ? e.message : "Failed to load song versions");
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [songQuery]);

  const displaySongTitle = toDisplayTrackTitle(songQuery || "").trim() || "Song";
  const DEFAULT_ARTWORK_SRC = "/api/default-artwork";
  async function fetchPlayableQueueForIdentifier(
    identifier: string,
    context?: {
      showKey?: string;
      showDate?: string;
      venueText?: string;
      artwork?: string;
    },
  ): Promise<Track[]> {
    try {
      const res = await fetch(`/api/ia/show-metadata?id=${encodeURIComponent(identifier)}`, {
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { files?: IaMetadataFile[] };
      const files = Array.isArray(data?.files) ? data.files : [];
      const audioAll = files.filter((f) => {
        const name = String(f?.name || "");
        return Boolean(name) && isAudioName(name);
      });
      if (audioAll.length === 0) return [];

      const bestSet = Math.min(...audioAll.map((f) => trackSetRank(String(f?.name || ""))));
      const inSet = audioAll.filter((f) => trackSetRank(String(f?.name || "")) === bestSet);
      const bestExt = Math.min(...inSet.map((f) => audioExtRank(String(f?.name || ""))));
      const picked = inSet.filter((f) => audioExtRank(String(f?.name || "")) === bestExt);

      picked.sort((a, b) => {
        const ta = parseTrackNum(a?.track);
        const tb = parseTrackNum(b?.track);
        if (ta !== tb) return ta - tb;
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      });

      const seen = new Set<string>();
      const queue: Track[] = [];
      for (const f of picked) {
        const fileName = String(f?.name || "").trim();
        if (!fileName) continue;
        const title = String(f?.title || f?.name || "").trim() || fileName;
        const lenRaw = String(f?.length || "").trim();
        const dedupeKey = `${title.toLowerCase()}|${lenRaw}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        queue.push({
          title: toDisplayTrackTitle(title),
          url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`,
          length: lenRaw || undefined,
          track: String(queue.length + 1),
          name: fileName,
          showKey: context?.showKey,
          showDate: context?.showDate,
          venueText: context?.venueText,
          artwork: context?.artwork,
        });
      }
      return queue;
    } catch {
      return [];
    }
  }

  async function ensurePlayableQueueForIdentifier(
    identifier: string,
    context?: {
      showKey?: string;
      showDate?: string;
      venueText?: string;
      artwork?: string;
    },
  ): Promise<Track[]> {
    const cached = queueByIdentifierRef.current[identifier];
    if (cached && cached.length > 0) return cached;
    const inFlight = inFlightQueueByIdentifierRef.current[identifier];
    if (inFlight) return inFlight;
    const task = fetchPlayableQueueForIdentifier(identifier, context);
    inFlightQueueByIdentifierRef.current[identifier] = task;
    try {
      const queue = await task;
      if (queue.length > 0) queueByIdentifierRef.current[identifier] = queue;
      return queue;
    } finally {
      delete inFlightQueueByIdentifierRef.current[identifier];
    }
  }

  async function resolveIdentifierForShow(show: ShowItem): Promise<string> {
    const direct = String(show.defaultId || "").trim();
    if (direct) return direct;
    const cached = String(resolvedShowIdsRef.current[show.showKey] || "").trim();
    if (cached) return cached;
    try {
      const res = await fetch(`/api/ia/show?key=${encodeURIComponent(show.showKey)}`, {
        cache: "no-store",
      });
      if (!res.ok) return "";
      const data = (await res.json()) as { defaultId?: string | null };
      const resolved = String(data?.defaultId || "").trim();
      if (!resolved) return "";
      resolvedShowIdsRef.current[show.showKey] = resolved;
      return resolved;
    } catch {
      return "";
    }
  }

  async function playSongResult(songShow: ShowItem) {
    setRequestedPlayShowKey(songShow.showKey);
    try {
      const songTitle = toDisplayTrackTitle(songShow.matchedSongTitle || displaySongTitle);
      const directUrl = String(songShow.matchedSongUrl || "").trim();
      if (directUrl) {
        setQueue(
          [
            {
              title: songTitle,
              url: directUrl,
              length: songShow.matchedSongLength || undefined,
              track: "1",
              showKey: songShow.showKey,
              showDate: songShow.showDate,
              venueText: toDisplayTitle(songShow.title),
              artwork: songShow.artwork,
            },
          ],
          0,
        );
        return;
      }

      const identifier = await resolveIdentifierForShow(songShow);
      if (!identifier) return;

      const queue = await ensurePlayableQueueForIdentifier(identifier, {
        showKey: songShow.showKey,
        showDate: songShow.showDate,
        venueText: toDisplayTitle(songShow.title),
        artwork: songShow.artwork,
      });
      if (!queue.length) return;
      const needle = normalizeSongText(songShow.matchedSongTitle || displaySongTitle);
      const startIndex = needle
        ? Math.max(
            0,
            queue.findIndex((t) => normalizeSongText(t.title).includes(needle)),
          )
        : 0;
      setQueue(queue, startIndex < 0 ? 0 : startIndex);
    } finally {
      setRequestedPlayShowKey((current) => (current === songShow.showKey ? null : current));
    }
  }

  const sortedShows = useMemo(() => {
    const arr = shows.slice();
    arr.sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return String(a.showDate || "").localeCompare(String(b.showDate || ""));
        case "song_len_longest": {
          const av = typeof a.matchedSongSeconds === "number" ? a.matchedSongSeconds : -1;
          const bv = typeof b.matchedSongSeconds === "number" ? b.matchedSongSeconds : -1;
          return bv - av;
        }
        case "song_len_shortest": {
          const av = typeof a.matchedSongSeconds === "number" ? a.matchedSongSeconds : Number.MAX_SAFE_INTEGER;
          const bv = typeof b.matchedSongSeconds === "number" ? b.matchedSongSeconds : Number.MAX_SAFE_INTEGER;
          return av - bv;
        }
        case "newest":
        default:
          return String(b.showDate || "").localeCompare(String(a.showDate || ""));
      }
    });
    return arr;
  }, [shows, sortMode]);

  return (
    <main className="min-h-screen bg-[#080017] text-white [font-family:var(--font-roboto-condensed)]">
      <div className="mx-auto w-full max-w-[1140px] px-4 pb-28 pt-[74px] md:px-6">
        <div className="mb-4 flex items-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-white/90 hover:text-white"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
                return;
              }
              router.push("/");
            }}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            <span className="text-sm">Back</span>
          </button>
        </div>

        <section className="mb-4 rounded-[16px] border border-white/20 bg-white/5 p-4 backdrop-blur-[6px]">
          <div className="text-[24px] leading-none font-semibold">
            Search results
          </div>
          <div className="mt-2 truncate text-[28px] leading-none font-medium">
            {displaySongTitle}
          </div>
          <div className="mt-2 text-[12px] text-white/75">
            {shows.length} show{shows.length === 1 ? "" : "s"}
          </div>
        </section>

        <div className="mb-4 flex items-center gap-2">
          <span className="text-[12px] text-white/70">Sort:</span>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              sortMode === "newest" ? "bg-[#5A22C9] text-white" : "bg-white/10 text-white/85"
            }`}
            onClick={() => setSortMode("newest")}
          >
            Newest
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              sortMode === "oldest" ? "bg-[#5A22C9] text-white" : "bg-white/10 text-white/85"
            }`}
            onClick={() => setSortMode("oldest")}
          >
            Oldest
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              sortMode === "song_len_longest" ? "bg-[#5A22C9] text-white" : "bg-white/10 text-white/85"
            }`}
            onClick={() => setSortMode("song_len_longest")}
          >
            Longest
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              sortMode === "song_len_shortest" ? "bg-[#5A22C9] text-white" : "bg-white/10 text-white/85"
            }`}
            onClick={() => setSortMode("song_len_shortest")}
          >
            Shortest
          </button>
        </div>

        {loading ? <div className="text-sm text-white/65">Loading versions...</div> : null}
        {error ? (
          <div className="rounded-xl border border-red-400/30 bg-red-600/15 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <section className="space-y-2">
            {sortedShows.map((s) => {
              const songTitle = toDisplayTrackTitle(s.matchedSongTitle || displaySongTitle);
              const canOpenShow = isValidShowKey(s.showKey);
              return (
                <div
                  key={s.showKey}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-white/20 bg-white/5 p-3 backdrop-blur-[6px]"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => {
                      if (!canOpenShow) return;
                      router.push(
                        `/show/${encodeURIComponent(s.showKey)}?song=${encodeURIComponent(songTitle)}`,
                      );
                    }}
                    disabled={!canOpenShow}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.artwork || DEFAULT_ARTWORK_SRC}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-[8px] border border-white/15 object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                        img.src = DEFAULT_ARTWORK_SRC;
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[18px] leading-none text-white">{songTitle}</div>
                      <div className="mt-1 truncate text-[12px] text-white/70">
                        {formatCardDate(s.showDate)} {toDisplayTitle(s.title)}
                      </div>
                    </div>
                  </button>
                  <div className="ml-1 flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      className="text-white"
                      aria-label="Play song"
                      onClick={() => {
                        void playSongResult(s);
                      }}
                    >
                      <FontAwesomeIcon
                        icon={requestedPlayShowKey === s.showKey ? faSpinner : faCirclePlay}
                        className={`text-3xl ${requestedPlayShowKey === s.showKey ? "animate-spin" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      className="text-white/70 hover:text-white"
                      aria-label="Open show details"
                      onClick={() => {
                        if (!canOpenShow) return;
                        router.push(
                          `/show/${encodeURIComponent(s.showKey)}?song=${encodeURIComponent(songTitle)}`,
                        );
                      }}
                      disabled={!canOpenShow}
                    >
                      <FontAwesomeIcon icon={faEllipsisVertical} />
                    </button>
                  </div>
                </div>
              );
            })}
            {!shows.length ? (
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
                No matching shows found.
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
