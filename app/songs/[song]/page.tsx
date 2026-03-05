"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faCirclePlay } from "@fortawesome/pro-solid-svg-icons";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";

type ShowItem = {
  showKey: string;
  showDate: string;
  title: string;
  artwork?: string;
  matchedSongTitle?: string | null;
  matchedSongLength?: string | null;
  matchedSongSeconds?: number | null;
};

type ShowsResponse = {
  song?: {
    total: number;
    items: ShowItem[];
  };
};
type SortMode = "newest" | "oldest" | "song_len_longest" | "song_len_shortest";

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

export default function SongVersionsPage() {
  const router = useRouter();
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
        const url = `/api/ia/shows?page=1&sort=newest&query=${encodeURIComponent(songQuery.trim())}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load song versions (${res.status})`);
        const data = (await res.json()) as ShowsResponse;
        if (!alive) return;
        const unique = uniqueByShowKey(data.song?.items || []);
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
              return (
                <div
                  key={s.showKey}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-white/20 bg-white/5 p-3 backdrop-blur-[6px]"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() =>
                      router.push(
                        `/show/${encodeURIComponent(s.showKey)}?song=${encodeURIComponent(songTitle)}`,
                      )
                    }
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
                  <button
                    type="button"
                    className="ml-1 shrink-0 text-white"
                    aria-label="Open show"
                    onClick={() =>
                      router.push(
                        `/show/${encodeURIComponent(s.showKey)}?song=${encodeURIComponent(songTitle)}`,
                      )
                    }
                  >
                    <FontAwesomeIcon icon={faCirclePlay} className="text-3xl" />
                  </button>
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
