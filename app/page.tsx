"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlay,
  faBookmark,
  faChevronLeft,
  faChevronRight,
  faChevronDown,
  faEllipsisVertical,
  faGuitar,
  faMagnifyingGlass,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import {
  faGuitarElectric,
  faTurntable,
  faViolin,
} from "@fortawesome/pro-solid-svg-icons";
import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { usePlayer, type Track } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";
import { shouldUseDefaultArtwork } from "@/utils/archiveArtwork";

type Continent =
  | "North America"
  | "South America"
  | "Europe"
  | "Asia"
  | "Africa"
  | "Oceania"
  | "Unknown";

type ShowItem = {
  showKey: string;
  showDate: string;
  title: string;
  city?: string;
  state?: string;
  country?: string;
  venueText?: string;
  locationText?: string;
  defaultId: string;
  sourcesCount: number;
  artwork: string;
  continent: Continent;
  plays: number;
  matchedSongSeconds?: number | null;
  matchedSongTitle?: string | null;
  matchedSongLength?: string | null;
  matchedSongUrl?: string | null;
  showLengthSeconds?: number | null;
  showTrackCount?: number | null;
  specialTag?: "ORCHESTRA" | "RAVE" | "ACOUSTIC";
};

type ShowPlaybackStats = {
  showLengthSeconds: number | null;
  showTrackCount: number | null;
};
type IaMetadataFile = {
  name?: string;
  title?: string;
  track?: string;
  length?: string | number;
};
type SongSheetTrack = {
  title: string;
  url: string;
  length?: string;
  track: string;
  showKey: string;
  showDate: string;
  venueText: string;
};

const SHOW_TYPE_OPTIONS = [
  { value: "Acoustic" },
  { value: "Rave" },
  { value: "Orchestra" },
  { value: "Standard" },
];
const QUICK_SHOW_FILTERS: {
  value: "Rave" | "Acoustic" | "Orchestra" | "Standard";
  label: string;
  icon: IconDefinition;
  activeClass: string;
  inactiveIconClass: string;
}[] = [
  {
    value: "Rave",
    label: "Rave",
    icon: faTurntable,
    activeClass: "bg-linear-to-br from-[rgb(197,16,243)] to-[rgb(28,47,143)]",
    inactiveIconClass: "text-fuchsia-300",
  },
  {
    value: "Acoustic",
    label: "Acoustic",
    icon: faGuitar,
    activeClass: "bg-linear-to-br from-[rgb(209,234,141)] to-[rgb(42,122,140)]",
    inactiveIconClass: "text-lime-200",
  },
  {
    value: "Orchestra",
    label: "Orchestra",
    icon: faViolin,
    activeClass: "bg-linear-to-br from-[rgb(227,85,140)] to-[rgb(244,158,102)]",
    inactiveIconClass: "text-rose-300",
  },
  {
    value: "Standard",
    label: "Rock",
    icon: faGuitarElectric,
    activeClass: "bg-linear-to-br from-[rgb(83,113,157)] to-[rgb(70,70,70)]",
    inactiveIconClass: "text-slate-300",
  },
];

const FAVORITE_SHOWS_KEY = "kglw.favoriteShows.v1";
const RECENT_SHOWS_KEY = "kglw.recentShows.v1";
const SHOW_STATS_CACHE_KEY = "kglw.showStats.v1";
const DEFAULT_ARTWORK_SRC = "/api/default-artwork";

function getArchiveIdentifier(url?: string): string {
  if (!url) return "";
  const match = String(url).match(/\/download\/([^/]+)\//i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function formatShowLength(sec?: number | null): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return "";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
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
  if (n.endsWith(".flac")) return 1;
  if (n.endsWith(".mp3")) return 2;
  if (n.endsWith(".m4a")) return 3;
  if (n.endsWith(".ogg")) return 4;
  if (n.endsWith(".wav")) return 5;
  return 999;
}

function trackSetRank(fileName: string): number {
  const n = fileName.toLowerCase();
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;
  if (n.includes("audience") || n.includes("matrix") || n.includes("soundboard")) return 3;
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel")) return 12;
  return 5;
}

function parseTrackNum(t?: string): number {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

function parseLengthToSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  return null;
}

async function fetchShowPlaybackStatsClient(identifier: string): Promise<ShowPlaybackStats> {
  try {
    const res = await fetch(`/api/ia/show-stats?identifier=${encodeURIComponent(identifier)}`, {
      cache: "no-store",
    });
    if (!res.ok) return { showLengthSeconds: null, showTrackCount: null };
    const data = (await res.json()) as ShowPlaybackStats;
    return {
      showLengthSeconds:
        typeof data?.showLengthSeconds === "number" ? data.showLengthSeconds : null,
      showTrackCount:
        typeof data?.showTrackCount === "number" ? data.showTrackCount : null,
    };
  } catch {
    return { showLengthSeconds: null, showTrackCount: null };
  }
}

function formatCardDate(input: string): string {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return input;
  const yy = m[1].slice(2);
  const mm = String(Number(m[2]));
  const dd = String(Number(m[3]));
  return `${mm}-${dd}-${yy}`;
}

function truncateWithEllipsis(input: string, maxChars = 34): string {
  const text = input.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function showCardVariant(tag?: "ORCHESTRA" | "RAVE" | "ACOUSTIC") {
  switch (tag) {
    case "ACOUSTIC":
      return {
        cardClass:
          "bg-linear-to-br from-[rgba(209,234,141,0.2)] to-[rgba(42,122,140,0.2)]",
        badgeClass:
          "bg-linear-to-br from-[rgb(209,234,141)] to-[rgb(42,122,140)] text-white",
        badgeText: "ACOUSTIC",
      };
    case "ORCHESTRA":
      return {
        cardClass:
          "bg-linear-to-br from-[rgba(227,85,140,0.2)] to-[rgba(244,158,102,0.2)]",
        badgeClass:
          "bg-linear-to-br from-[rgb(227,85,140)] to-[rgb(244,158,102)] text-white",
        badgeText: "Orchestra",
      };
    case "RAVE":
      return {
        cardClass:
          "bg-linear-to-b from-[rgba(197,16,243,0.2)] to-[rgba(10,143,245,0.2)]",
        badgeClass:
          "bg-linear-to-br from-[rgb(197,16,243)] to-[rgb(28,47,143)] text-white",
        badgeText: "Rave",
      };
    default:
      return {
        cardClass:
          "bg-linear-to-br from-[rgba(83,113,157,0.2)] to-[rgba(70,70,70,0.2)]",
        badgeClass: "",
        badgeText: "",
      };
  }
}

function labelFromShowKey(showKey: string): string {
  const raw = showKey.split("|")[1] || "";
  if (!raw) return "";
  return raw
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type ShowsResponse = {
  page: number;
  items: ShowItem[];
  hasMore: boolean;
  venueTotal?: number;
  song?: {
    query: string;
    total: number;
    items: ShowItem[];
  };
  facets?: {
    years: { value: string; count: number }[];
    continents: { value: string; count: number }[];
  };
};

function summarizeSelection(values: string[], emptyLabel = "All") {
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]}, ${values[1]}`;
  return `${values[0]}, ${values[1]} +${values.length - 2}`;
}

function fmtSongLen(sec?: number | null): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "n/a";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function displaySongLength(raw?: string | null, sec?: number | null): string {
  const v = (raw || "").trim();
  if (v && /^\d+(\.\d+)?$/.test(v)) return fmtSongLen(Number(v));
  if (v) return v;
  return fmtSongLen(sec);
}

function MultiSelectDropdown(props: {
  id: string;
  label: string;
  options: { value: string; count?: number }[];
  value: string[];
  onChange: (next: string[]) => void;
  minWidthClass?: string;
  emptyLabel?: string;
}) {
  const { id, label, options, value, onChange, minWidthClass, emptyLabel } = props;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setDraft(value);
      }
    }

    function onPointerDown(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setOpen(false);
      setDraft(value);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, value]);

  const summary = summarizeSelection(value, emptyLabel || "All");
  const full = value.join(", ") || (emptyLabel || "All");

  return (
    <div
      ref={containerRef}
      className={`relative ${minWidthClass || ""}`.trim()}
    >
      <label htmlFor={id} className="mb-2 block text-sm text-white/70">
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        title={full}
        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 transition"
        onClick={() => {
          setDraft(value);
          setOpen((v) => !v);
        }}
      >
        <span className="block truncate">{summary}</span>
      </button>

      {open && (
        <div
          id={`${id}-panel`}
          role="dialog"
          aria-label={`${label} filter`}
          className="absolute right-0 z-50 mt-2 w-[18rem] rounded-xl border border-white/15 bg-black/70 backdrop-blur p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="text-xs text-white/70 hover:text-white transition"
              onClick={() => setDraft(options.map((o) => o.value))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs text-white/70 hover:text-white transition"
              onClick={() => setDraft([])}
            >
              Clear
            </button>
          </div>

          <div className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-white/5">
            {options.map((opt) => {
              const checked = draft.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-white/5 cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={(e) => {
                        const nextChecked = e.target.checked;
                        setDraft((prev) => {
                          if (nextChecked)
                            return prev.includes(opt.value)
                              ? prev
                              : prev.concat(opt.value);
                          return prev.filter((v) => v !== opt.value);
                        });
                      }}
                    />
                    <span className="truncate">{opt.value}</span>
                  </span>
                  {typeof opt.count === "number" ? (
                    <span className="text-xs text-white/50">{opt.count}</span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-white/60">
              {draft.length} of {options.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:border-white/25 hover:text-white transition"
                onClick={() => {
                  setOpen(false);
                  setDraft(value);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 transition"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const setQueue = usePlayer((s) => s.setQueue);
  const playlists = usePlaylists((s) => s.playlists);
  const addTrackToPlaylist = usePlaylists((s) => s.addTrack);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);

  const [shows, setShows] = useState<ShowItem[]>([]);
  const [songShows, setSongShows] = useState<ShowItem[]>([]);
  const [songTotal, setSongTotal] = useState(0);
  const [venueTotal, setVenueTotal] = useState(0);
  const [resultFilter, setResultFilter] = useState<"shows" | "venues">("venues");
  const [songLengthSort, setSongLengthSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [years, setYears] = useState<string[]>([]);
  const [continents, setContinents] = useState<string[]>([]);
  const [showTypes, setShowTypes] = useState<string[]>([]);
  const [yearFacet, setYearFacet] = useState<
    { value: string; count: number }[]
  >([]);
  const [continentFacet, setContinentFacet] = useState<
    { value: string; count: number }[]
  >([]);
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const [showTab, setShowTab] = useState<"all" | "recent" | "favorites">("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [favoriteShows, setFavoriteShows] = useState<string[]>([]);
  const [recentShows, setRecentShows] = useState<string[]>([]);
  const [statsById, setStatsById] = useState<Record<string, ShowPlaybackStats>>({});
  const inFlightStatsIdsRef = useRef<Set<string>>(new Set());
  const queueByIdentifierRef = useRef<Record<string, Track[]>>({});
  const playPendingRef = useRef<Set<string>>(new Set());
  const [songSheetTrack, setSongSheetTrack] = useState<SongSheetTrack | null>(null);
  const [showSongPlaylistPicker, setShowSongPlaylistPicker] = useState(false);
  const [songShareState, setSongShareState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [songPlaylistActionState, setSongPlaylistActionState] = useState<
    Record<string, "added" | "exists" | undefined>
  >({});
  const [songNewPlaylistName, setSongNewPlaylistName] = useState("");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  function buildUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    for (const y of years) params.append("year", y);
    for (const c of continents) params.append("continent", c);
    for (const t of showTypes) params.append("showType", t);
    params.set("sort", sort);
    return `/api/ia/shows?${params.toString()}`; // IMPORTANT: use /api/ia/shows
  }

  function buildSongSearchUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    for (const y of years) params.append("year", y);
    for (const c of continents) params.append("continent", c);
    for (const t of showTypes) params.append("showType", t);
    params.set("query", debouncedQuery);
    params.set("sort", sort);
    return `/api/ia/shows?${params.toString()}`;
  }

  async function loadPage(p: number, mode: "append" | "replace") {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(buildUrl(p), { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as ShowsResponse;

      if (data.facets?.years) setYearFacet(data.facets.years);
      if (data.facets?.continents) setContinentFacet(data.facets.continents);
      if (mode === "replace") {
        setSongShows(data.song?.items || []);
        setSongTotal(data.song?.total || 0);
        setVenueTotal(data.venueTotal || 0);
      }

      setShows((prev) => {
        if (mode === "replace") return data.items;

        // Keep server order (important for sorts like most/least played).
        const seen = new Set(prev.map((s) => s.showKey));
        const merged = prev.slice();
        for (const s of data.items) {
          if (seen.has(s.showKey)) continue;
          seen.add(s.showKey);
          merged.push(s);
        }
        return merged;
      });

      setHasMore(Boolean(data.hasMore));
      setPage(p);
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
      else setError("Failed to load shows");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const favRaw = localStorage.getItem(FAVORITE_SHOWS_KEY);
      const recRaw = localStorage.getItem(RECENT_SHOWS_KEY);
      const favParsed = JSON.parse(favRaw || "[]");
      const recParsed = JSON.parse(recRaw || "[]");
      setFavoriteShows(Array.isArray(favParsed) ? favParsed : []);
      setRecentShows(Array.isArray(recParsed) ? recParsed : []);
    } catch {
      setFavoriteShows([]);
      setRecentShows([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHOW_STATS_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;

      const cleaned: Record<string, ShowPlaybackStats> = {};
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== "object") continue;
        const maybe = value as {
          showLengthSeconds?: unknown;
          showTrackCount?: unknown;
        };
        const showLengthSeconds =
          typeof maybe.showLengthSeconds === "number" &&
          Number.isFinite(maybe.showLengthSeconds)
            ? maybe.showLengthSeconds
            : null;
        const showTrackCount =
          typeof maybe.showTrackCount === "number" &&
          Number.isFinite(maybe.showTrackCount)
            ? maybe.showTrackCount
            : null;
        if (showLengthSeconds == null && showTrackCount == null) continue;
        cleaned[id] = { showLengthSeconds, showTrackCount };
      }
      if (Object.keys(cleaned).length > 0) {
        setStatsById((prev) => ({ ...cleaned, ...prev }));
      }
    } catch {
      // Ignore bad cache payloads and continue normally.
    }
  }, []);

  useEffect(() => {
    try {
      // Persist only computed values so transient nulls don't get stuck forever.
      const persistable = Object.fromEntries(
        Object.entries(statsById).filter(([, stats]) => {
          const hasLength =
            typeof stats?.showLengthSeconds === "number" &&
            Number.isFinite(stats.showLengthSeconds);
          const hasTrackCount =
            typeof stats?.showTrackCount === "number" &&
            Number.isFinite(stats.showTrackCount);
          return hasLength || hasTrackCount;
        }),
      );
      localStorage.setItem(SHOW_STATS_CACHE_KEY, JSON.stringify(persistable));
    } catch {
      // Ignore storage quota / serialization errors.
    }
  }, [statsById]);

  // Debounce search so we don't re-fetch on every single keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setShows([]);
    setHasMore(true);
    setPage(1);
    loadPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|"), continents.join("|"), showTypes.join("|"), sort]);

  useEffect(() => {
    let alive = true;
    async function runSongSearch() {
      if (!debouncedQuery) {
        if (!alive) return;
        setSongShows([]);
        setSongTotal(0);
        return;
      }
      try {
        const res = await fetch(buildSongSearchUrl(1), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ShowsResponse;
        if (!alive) return;
        setSongShows(data.song?.items || []);
        setSongTotal(data.song?.total || 0);
      } catch {
        if (!alive) return;
        setSongShows([]);
        setSongTotal(0);
      }
    }
    runSongSearch();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|"), continents.join("|"), showTypes.join("|"), debouncedQuery, sort]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResultFilter("venues");
      return;
    }
    if (resultFilter === "shows" && songTotal <= 0) {
      setResultFilter("venues");
    }
  }, [debouncedQuery, songTotal, resultFilter]);

  const canInfiniteLoad = !(debouncedQuery && resultFilter === "shows");

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading) return;
        if (!hasMore) return;
        if (!canInfiniteLoad) return;
        loadPage(page + 1, "append");
      },
      { root: null, rootMargin: "600px", threshold: 0 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, page, canInfiniteLoad]);

  const availableYears = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of yearFacet) map.set(o.value, o.count);
    for (const y of years) if (!map.has(y)) map.set(y, 0);

    return Array.from(map.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([value, count]) => ({ value, count }));
  }, [yearFacet, years]);

  const availableContinents = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of continentFacet) map.set(o.value, o.count);
    for (const c of continents) if (!map.has(c)) map.set(c, 0);

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  }, [continentFacet, continents]);

  const sortedSongShows = useMemo(() => {
    const arr = songShows.slice();
    arr.sort((a, b) => {
      const av = typeof a.matchedSongSeconds === "number" ? a.matchedSongSeconds : -1;
      const bv = typeof b.matchedSongSeconds === "number" ? b.matchedSongSeconds : -1;
      if (songLengthSort === "asc") return av - bv;
      return bv - av;
    });
    return arr;
  }, [songShows, songLengthSort]);

  const favoriteSet = useMemo(() => new Set(favoriteShows), [favoriteShows]);
  const recentSet = useMemo(() => new Set(recentShows), [recentShows]);

  const venueShows = useMemo(() => {
    if (showTab === "favorites") return shows.filter((s) => favoriteSet.has(s.showKey));
    if (showTab === "recent") {
      const byKey = new Map(shows.map((s) => [s.showKey, s]));
      const ordered = recentShows
        .map((key) => byKey.get(key))
        .filter(Boolean) as ShowItem[];
      if (ordered.length > 0) return ordered;
      return shows.filter((s) => recentSet.has(s.showKey));
    }
    return shows;
  }, [shows, showTab, favoriteSet, recentSet, recentShows]);
  const featuredPlaylists = useMemo(() => playlists.slice(0, 10), [playlists]);
  const sortLabel = useMemo(() => {
    switch (sort) {
      case "oldest":
        return "Oldest";
      case "most_played":
        return "Most played";
      case "least_played":
        return "Least played";
      case "show_length_longest":
        return "Longest show";
      case "show_length_shortest":
        return "Shortest show";
      case "newest":
      default:
        return "Newest";
    }
  }, [sort]);
  const topSongMatch = sortedSongShows[0] || null;
  const songAvgMinutesLabel = useMemo(() => {
    const durations = sortedSongShows
      .map((s) => s.matchedSongSeconds)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
    if (durations.length === 0) return "n/a";
    const avgSec = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const mins = Math.max(1, Math.round(avgSec / 60));
    return `${mins} min`;
  }, [sortedSongShows]);
  const mostPlayedSongShowKey = useMemo(() => {
    if (sortedSongShows.length === 0) return "";
    let best: ShowItem | null = null;
    for (const s of sortedSongShows) {
      if (!best || (s.plays || 0) > (best.plays || 0)) best = s;
    }
    return best?.showKey || "";
  }, [sortedSongShows]);
  const longestSongShowKey = useMemo(() => {
    if (sortedSongShows.length === 0) return "";
    let best: ShowItem | null = null;
    for (const s of sortedSongShows) {
      const sec = typeof s.matchedSongSeconds === "number" ? s.matchedSongSeconds : -1;
      const bestSec =
        typeof best?.matchedSongSeconds === "number" ? best.matchedSongSeconds : -1;
      if (!best || sec > bestSec) best = s;
    }
    return best?.showKey || "";
  }, [sortedSongShows]);

  useEffect(() => {
    let cancelled = false;
    const unresolvedIds = Array.from(
      new Set(
        venueShows
          .filter(
            (s) =>
              !Number.isFinite(s.showTrackCount ?? NaN) ||
              !Number.isFinite(s.showLengthSeconds ?? NaN),
          )
          .map((s) => s.defaultId)
          .filter(Boolean),
      ),
    )
      .filter(
        (id) =>
          !Object.prototype.hasOwnProperty.call(statsById, id) &&
          !inFlightStatsIdsRef.current.has(id),
      )
      .slice(0, 24);
    if (unresolvedIds.length === 0) return;

    // Mark these as in-flight up front to prevent duplicate requests across effect reruns.
    for (const id of unresolvedIds) inFlightStatsIdsRef.current.add(id);

    async function run() {
      const queue = unresolvedIds.slice();
      const workers = Array.from(
        { length: Math.min(4, queue.length) },
        async () => {
          while (queue.length > 0) {
            const identifier = queue.shift();
            if (!identifier) return;
            try {
              const stats = await fetchShowPlaybackStatsClient(identifier);
              if (cancelled) return;
              setStatsById((prev) => {
                if (Object.prototype.hasOwnProperty.call(prev, identifier)) return prev;
                // Store even null stats so we don't retry endlessly.
                return { ...prev, [identifier]: stats };
              });
            } finally {
              inFlightStatsIdsRef.current.delete(identifier);
            }
          }
        },
      );
      await Promise.all(workers);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [venueShows, statsById]);

  useEffect(() => {
    const targets = venueShows.slice(0, 16);
    for (const s of targets) {
      router.prefetch(`/show/${encodeURIComponent(s.showKey)}`);
    }
  }, [venueShows, router]);

  function persistFavorites(next: string[]) {
    setFavoriteShows(next);
    localStorage.setItem(FAVORITE_SHOWS_KEY, JSON.stringify(next));
  }

  function toggleFavoriteShow(showKey: string) {
    if (favoriteSet.has(showKey)) {
      persistFavorites(favoriteShows.filter((k) => k !== showKey));
      return;
    }
    persistFavorites([showKey, ...favoriteShows].slice(0, 400));
  }

  function rememberRecentShow(showKey: string) {
    const next = [showKey, ...recentShows.filter((k) => k !== showKey)].slice(0, 100);
    setRecentShows(next);
    localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(next));
  }

  async function fetchPlayableQueueForIdentifier(identifier: string): Promise<Track[]> {
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

      const bestSet = Math.min(
        ...audioAll.map((f) => trackSetRank(String(f?.name || ""))),
      );
      const inSet = audioAll.filter(
        (f) => trackSetRank(String(f?.name || "")) === bestSet,
      );
      const bestExt = Math.min(
        ...inSet.map((f) => audioExtRank(String(f?.name || ""))),
      );
      const picked = inSet.filter(
        (f) => audioExtRank(String(f?.name || "")) === bestExt,
      );

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
        });
      }
      return queue;
    } catch {
      return [];
    }
  }

  async function playShowFromCard(show: ShowItem) {
    const identifier = String(show.defaultId || "").trim();
    if (!identifier) return;

    rememberRecentShow(show.showKey);
    const cached = queueByIdentifierRef.current[identifier];
    if (cached && cached.length > 0) {
      setQueue(cached, 0);
      return;
    }
    if (playPendingRef.current.has(identifier)) return;

    playPendingRef.current.add(identifier);
    try {
      const queue = await fetchPlayableQueueForIdentifier(identifier);
      if (queue.length === 0) return;
      queueByIdentifierRef.current[identifier] = queue;
      setQueue(queue, 0);
    } finally {
      playPendingRef.current.delete(identifier);
    }
  }

  function normalizeSongText(v: string): string {
    return String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function closeSongSheet() {
    setSongSheetTrack(null);
    setShowSongPlaylistPicker(false);
    setSongShareState("idle");
    setSongPlaylistActionState({});
    setSongNewPlaylistName("");
  }

  async function playSongResult(songShow: ShowItem) {
    const identifier = String(songShow.defaultId || "").trim();
    if (!identifier) return;

    rememberRecentShow(songShow.showKey);
    let queue = queueByIdentifierRef.current[identifier];
    if (!queue || queue.length === 0) {
      if (playPendingRef.current.has(identifier)) return;
      playPendingRef.current.add(identifier);
      try {
        queue = await fetchPlayableQueueForIdentifier(identifier);
        if (!queue || queue.length === 0) return;
        queueByIdentifierRef.current[identifier] = queue;
      } finally {
        playPendingRef.current.delete(identifier);
      }
    }

    const needle = normalizeSongText(songShow.matchedSongTitle || debouncedQuery);
    const startIndex = needle
      ? Math.max(
          0,
          queue.findIndex((t) => normalizeSongText(t.title).includes(needle)),
        )
      : 0;
    setQueue(queue, startIndex < 0 ? 0 : startIndex);
  }

  return (
    <main className="min-h-screen bg-[#080017] text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[rgba(13,2,33,0.8)] backdrop-blur-[34px]">
        <div className="mx-auto flex h-[58px] w-full max-w-[1140px] items-end px-4 pb-4 md:px-6">
          <div className="text-[16px] font-light [font-family:var(--font-roboto-condensed)]">
            SetlistAppName
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1140px] px-4 pb-28 pt-[74px] md:px-6">
        <div className="space-y-10">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[34px] leading-none font-semibold">Playlists</h2>
              <Link
                href="/playlists"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[#5a22c9] px-4 py-2 text-sm"
              >
                <span>See All</span>
                <span className="text-[13px]">›</span>
              </Link>
            </div>

            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
              {featuredPlaylists.length === 0 ? (
                <Link
                  href="/playlists"
                  className="min-w-[176px] snap-start rounded-2xl border border-[#de78e5] bg-linear-to-br from-[rgba(223,119,229,0.1)] to-[rgba(26,157,177,0.1)] p-3"
                >
                  <div className="mb-3 flex h-[135px] items-center justify-center rounded-md bg-linear-to-br from-[#6d24a4] to-[#2a0f53] text-4xl text-white/60">
                    ♪
                  </div>
                  <div className="line-clamp-2 text-[16px] leading-[1.1] font-semibold">
                    Create your first playlist
                  </div>
                  <div className="mt-2 text-sm text-white/80">Tap to get started</div>
                </Link>
              ) : (
                featuredPlaylists.map((p) => {
                  const firstUrl = p.slots[0]?.variants[0]?.track?.url;
                  const identifier = getArchiveIdentifier(firstUrl);
                  const art = identifier
                    ? `https://archive.org/services/img/${encodeURIComponent(identifier)}`
                    : "";
                  const imageSrc =
                    art && !shouldUseDefaultArtwork(identifier)
                      ? art
                      : DEFAULT_ARTWORK_SRC;
                  const versions = p.slots.reduce(
                    (sum, slot) => sum + slot.variants.length,
                    0,
                  );
                  return (
                    <Link
                      key={p.id}
                      href={`/playlists/${p.id}`}
                      className="min-w-[176px] snap-start rounded-2xl border border-[#de78e5] bg-linear-to-br from-[rgba(223,119,229,0.1)] to-[rgba(26,157,177,0.1)] p-3"
                    >
                      <div className="mb-3 h-[135px] overflow-hidden rounded-md bg-linear-to-br from-[#6d24a4] to-[#2a0f53]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageSrc}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                            img.src = DEFAULT_ARTWORK_SRC;
                          }}
                        />
                      </div>
                      <div className="line-clamp-2 text-[16px] leading-[1.1] font-semibold">
                        {p.name}
                      </div>
                      <div className="mt-2 text-sm text-white/80">
                        {p.slots.length} Tracks • {versions} Versions
                      </div>
                      <div className="mt-1 text-[16px] text-white/90">Jackthe5nack</div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-[34px] leading-none font-semibold">Shows</h2>
            </div>

            <div className="mb-3">
              <div className="relative">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-white"
                />
                <input
                  id="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search songs, shows, venues, etc"
                  className="w-full rounded-xl border border-white/50 bg-transparent px-11 py-[14px] text-[14px] text-white outline-none placeholder:text-white/60"
                  autoComplete="off"
                />
              </div>
              {debouncedQuery && resultFilter === "venues" && songTotal > 0 && topSongMatch && (
                <button
                  type="button"
                  className="mt-2 w-full rounded-b-xl rounded-t-none border border-white/30 px-4 pb-3 pt-6 text-left"
                  onClick={() => setResultFilter("shows")}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-white">
                        {toDisplayTrackTitle(topSongMatch.matchedSongTitle || debouncedQuery)}
                      </div>
                      <div className="text-xs text-white/70">
                        Last played: {formatCardDate(topSongMatch.showDate)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/70">
                        {songTotal}
                      </span>
                      <FontAwesomeIcon icon={faChevronRight} className="text-xs text-white" />
                    </div>
                  </div>
                </button>
              )}
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              {QUICK_SHOW_FILTERS.map((opt) => {
                const active = showTypes.includes(opt.value) && showTypes.length === 1;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`rounded-xl px-2 py-2 text-center transition ${
                      active ? `${opt.activeClass} text-white` : "bg-white/10 text-white"
                    }`}
                    onClick={() => {
                      if (active) {
                        setShowTypes([]);
                        return;
                      }
                      setShowTypes([opt.value]);
                    }}
                  >
                    <div className={`text-[18px] ${active ? "text-white" : opt.inactiveIconClass}`}>
                      <FontAwesomeIcon icon={opt.icon} className="h-[18px] w-[23px]" />
                    </div>
                    <div className="text-[13px]">{opt.label}</div>
                  </button>
                );
              })}
            </div>

            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                aria-label="Toggle advanced filters"
                className="rounded-full border border-white px-3 py-2 text-[12px] text-white"
                onClick={() => setAdvancedFiltersOpen((v) => !v)}
              >
                <FontAwesomeIcon icon={faSliders} />
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] ${
                  showTab === "favorites"
                    ? "border-white bg-white text-[#080017]"
                    : "border-white text-white"
                }`}
                onClick={() =>
                  setShowTab((prev) => (prev === "favorites" ? "all" : "favorites"))
                }
              >
                <span>Saved</span>
                <FontAwesomeIcon icon={faBookmark} />
              </button>
              <label className="inline-flex items-center gap-2 rounded-full border border-white px-3 py-2 text-[12px] text-white">
                <span>{sortLabel}</span>
                <FontAwesomeIcon icon={faChevronDown} />
                <select
                  id="sort"
                  className="w-0 appearance-none bg-transparent text-transparent"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="most_played">Most played</option>
                  <option value="least_played">Least played</option>
                  <option value="show_length_longest">Longest show</option>
                  <option value="show_length_shortest">Shortest show</option>
                </select>
              </label>
            </div>

            <div className="mb-3 text-[12px] font-medium text-white">{venueShows.length} Shows</div>

            {advancedFiltersOpen && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <MultiSelectDropdown
                    id="years"
                    label=""
                    options={availableYears}
                    value={years}
                    onChange={setYears}
                    minWidthClass="min-w-[110px]"
                    emptyLabel="Years"
                  />
                  <MultiSelectDropdown
                    id="continents"
                    label=""
                    options={availableContinents}
                    value={continents}
                    onChange={setContinents}
                    minWidthClass="min-w-[124px]"
                    emptyLabel="Continent"
                  />
                  <MultiSelectDropdown
                    id="showTypes"
                    label=""
                    options={SHOW_TYPE_OPTIONS}
                    value={showTypes}
                    onChange={setShowTypes}
                    minWidthClass="min-w-[132px]"
                    emptyLabel="Show Type"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-xl border border-red-400/30 bg-red-600/15 p-3 text-sm text-red-100">
                {error}
              </div>
            )}

            {debouncedQuery && resultFilter === "shows" ? (
              <div className="mb-3">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-white"
                    onClick={() => setResultFilter("venues")}
                    aria-label="Back to venue results"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  <div className="text-center">
                    <div className="text-xl text-white">
                      {toDisplayTrackTitle(topSongMatch?.matchedSongTitle || debouncedQuery)}
                    </div>
                    <div className="text-xs text-white/70">Avg. length: {songAvgMinutesLabel}</div>
                  </div>
                  <span className="w-2" />
                </div>

                <div className="mb-2 text-xs font-medium text-white">{songTotal} Shows</div>
                <div className="space-y-2">
                  {sortedSongShows.map((s) => {
                    const songTitle = toDisplayTrackTitle(s.matchedSongTitle || debouncedQuery);
                    const timeLabel = displaySongLength(s.matchedSongLength, s.matchedSongSeconds);
                    const isMostPlayed = s.showKey === mostPlayedSongShowKey;
                    const isLongest = s.showKey === longestSongShowKey;
                    return (
                      <div
                        key={`song-${s.showKey}`}
                        className="flex items-center justify-between rounded-xl border border-white/20 px-3 py-2"
                      >
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => {
                            rememberRecentShow(s.showKey);
                            router.push(
                              `/show/${encodeURIComponent(s.showKey)}?song=${encodeURIComponent(songTitle)}`,
                            );
                          }}
                        >
                          <div className="truncate text-2xl leading-none text-white">{songTitle}</div>
                          <div className="truncate text-xs text-white/70">
                            {formatCardDate(s.showDate)} {toDisplayTitle(s.title)}
                          </div>
                          {(isMostPlayed || isLongest) && (
                            <div className="mt-1 flex items-center gap-1">
                              {isMostPlayed ? (
                                <span className="rounded-full bg-white/10 px-2 py-[2px] text-[10px] text-white/90">
                                  Most Played
                                </span>
                              ) : null}
                              {isLongest ? (
                                <span className="rounded-full bg-white/10 px-2 py-[2px] text-[10px] text-white/90">
                                  Longest
                                </span>
                              ) : null}
                            </div>
                          )}
                        </button>
                        <div className="ml-2 flex items-center gap-3">
                          <span className="text-xl text-white">{timeLabel}</span>
                          <button
                            type="button"
                            className="text-white"
                            onClick={() => {
                              void playSongResult(s);
                            }}
                            aria-label="Play show"
                          >
                            <FontAwesomeIcon icon={faCirclePlay} className="text-3xl" />
                          </button>
                          <button
                            type="button"
                            className="text-white/70"
                            aria-label="More options"
                            onClick={() => {
                              setSongSheetTrack({
                                title: songTitle,
                                url: s.matchedSongUrl || "",
                                length: s.matchedSongLength || undefined,
                                track: "1",
                                showKey: s.showKey,
                                showDate: s.showDate,
                                venueText: toDisplayTitle(s.title),
                              });
                              setShowSongPlaylistPicker(false);
                              setSongShareState("idle");
                              setSongPlaylistActionState({});
                            }}
                          >
                            <FontAwesomeIcon icon={faEllipsisVertical} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {venueShows.map((s) => {
                    const isFav = favoriteSet.has(s.showKey);
                    const clientStats = statsById[s.defaultId];
                    const showLengthSeconds =
                      s.showLengthSeconds ?? clientStats?.showLengthSeconds ?? null;
                    const showTrackCount =
                      s.showTrackCount ?? clientStats?.showTrackCount ?? null;
                    const isStatsLoading =
                      !Number.isFinite(showTrackCount ?? NaN) &&
                      !Number.isFinite(showLengthSeconds ?? NaN) &&
                      !Object.prototype.hasOwnProperty.call(statsById, s.defaultId);
                    const lengthText = formatShowLength(showLengthSeconds);
                    const trackCount = Number.isFinite(showTrackCount ?? NaN)
                      ? Math.max(0, Number(showTrackCount))
                      : null;
                    const specialTag = s.specialTag || null;
                    const variant = showCardVariant(specialTag || undefined);
                    const displayTitle = truncateWithEllipsis(toDisplayTitle(s.title), 38);
                    const imageSrc = shouldUseDefaultArtwork(s.defaultId)
                      ? DEFAULT_ARTWORK_SRC
                      : s.artwork;
                    return (
                      <div
                        key={s.showKey}
                        className={`relative flex h-full flex-col rounded-2xl p-3 ${variant.cardClass}`}
                      >
                        <button
                          type="button"
                          className="flex w-full flex-1 flex-col text-center"
                          onClick={() => {
                            rememberRecentShow(s.showKey);
                            router.push(`/show/${encodeURIComponent(s.showKey)}`);
                          }}
                        >
                          <div className="relative h-[144px] w-full overflow-hidden rounded-lg bg-black/30">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageSrc}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                                img.src = DEFAULT_ARTWORK_SRC;
                              }}
                            />
                            {specialTag ? (
                              <span
                                className={`absolute bottom-2 left-1/2 -translate-x-1/2 rounded-[6px] px-3 py-[3px] text-[12px] leading-none font-medium tracking-[0.2px] ${variant.badgeClass}`}
                              >
                                {variant.badgeText}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-[13px] text-white [font-family:var(--font-roboto-condensed)]">
                            {formatCardDate(s.showDate)}
                          </div>
                          <div className="line-clamp-2 text-[14px] leading-[1.15] font-semibold tracking-[0.3px] [font-family:var(--font-roboto-condensed)]">
                            {displayTitle}
                          </div>
                          {s.city ? (
                            <div className="mt-1 text-[12px] leading-[1.1] font-light text-white/80 [font-family:var(--font-roboto-condensed)]">
                              {s.city}
                            </div>
                          ) : null}
                          <div className="mt-1 flex items-center justify-center gap-[6px] text-[12px] text-white/90 [font-family:var(--font-roboto-condensed)]">
                            {isStatsLoading ? (
                              <span className="animate-pulse text-white/70">
                                Loading stats...
                              </span>
                            ) : (
                              <>
                                <span>{trackCount ?? "—"} Tracks</span>
                                {lengthText ? (
                                  <>
                                    <span className="inline-block size-[3px] rounded-full bg-white/90" />
                                    <span>{lengthText}</span>
                                  </>
                                ) : null}
                              </>
                            )}
                          </div>
                        </button>

                        <div className="mt-auto flex justify-center pt-3">
                          <div className="inline-flex h-[31px] items-center justify-center gap-[10px] rounded-[8px] border border-black/20 bg-black/20 px-3">
                            <button
                              type="button"
                              aria-label={isFav ? "Remove favorite show" : "Favorite show"}
                              className={`inline-flex h-[15px] w-[16px] items-center justify-center ${isFav ? "text-fuchsia-300" : "text-white"}`}
                              onClick={() => toggleFavoriteShow(s.showKey)}
                              title={isFav ? "Unfavorite show" : "Favorite show"}
                            >
                              {isFav ? (
                                <FontAwesomeIcon icon={faBookmark} className="h-4 w-4" />
                              ) : (
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                  <path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v16.5l-6.5-4-6.5 4V5A1.5 1.5 0 0 1 7 3.5Z" />
                                </svg>
                              )}
                            </button>
                            <span className="h-[29px] w-px bg-black/30" />
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[12px] text-white [font-family:var(--font-roboto-condensed)]"
                              onClick={() => {
                                void playShowFromCard(s);
                              }}
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path d="M8 6v12l10-6-10-6Z" />
                              </svg>
                              <span>Play</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {venueShows.length === 0 && (
                  <div className="mt-3 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
                    No shows found for this filter.
                  </div>
                )}
              </>
            )}

            <div className="py-8">
              {loading && <div className="text-sm text-white/65">Loading…</div>}
              {!loading && hasMore && canInfiniteLoad && (
                <button
                  type="button"
                  className="mb-3 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
                  onClick={() => loadPage(page + 1, "append")}
                >
                  Load more
                </button>
              )}
              {!hasMore && !loading && (
                <div className="text-sm text-white/50">End of list.</div>
              )}
              <div ref={sentinelRef} />
            </div>
          </section>
        </div>
      </div>

      {songSheetTrack && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => closeSongSheet()}
        >
          <div
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[393px] rounded-t-2xl border border-white/15 bg-[#080017] px-6 pb-10 pt-6 shadow-[0_-4px_16px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            {!showSongPlaylistPicker ? (
              <>
                <div className="mb-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="truncate text-[22px] leading-none">
                      {toDisplayTrackTitle(songSheetTrack.title)}
                    </div>
                    <div className="text-sm text-white/85">
                      {songSheetTrack.length || "—"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-white/45">
                    <div className="min-w-0 truncate">pin {songSheetTrack.venueText}</div>
                    <div className="shrink-0">{formatCardDate(songSheetTrack.showDate)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl bg-[rgba(48,26,89,0.25)] px-4 py-4 text-base hover:bg-[rgba(72,36,124,0.35)] transition"
                      onClick={() => toggleFavoriteShow(songSheetTrack.showKey)}
                    >
                      <span>{favoriteSet.has(songSheetTrack.showKey) ? "★" : "♡"}</span>
                      <span>{favoriteSet.has(songSheetTrack.showKey) ? "Favorited show" : "Favorite show"}</span>
                    </button>

                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl bg-[rgba(48,26,89,0.25)] px-4 py-4 text-base hover:bg-[rgba(72,36,124,0.35)] transition"
                      onClick={async () => {
                        try {
                          const songUrl = `${window.location.origin}/show/${encodeURIComponent(songSheetTrack.showKey)}?song=${encodeURIComponent(songSheetTrack.title)}`;
                          await navigator.clipboard.writeText(songUrl);
                          setSongShareState("copied");
                          setTimeout(() => setSongShareState("idle"), 1500);
                        } catch {
                          setSongShareState("error");
                          setTimeout(() => setSongShareState("idle"), 1500);
                        }
                      }}
                    >
                      <span>➤</span>
                      <span>
                        Share
                        {songShareState === "copied" ? " • copied" : ""}
                        {songShareState === "error" ? " • failed" : ""}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!songSheetTrack.url}
                    className="w-full rounded-xl bg-[rgba(48,26,89,0.25)] px-4 py-4 text-base hover:bg-[rgba(72,36,124,0.35)] transition disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setShowSongPlaylistPicker(true)}
                  >
                    + Add to playlist(s)
                  </button>
                </div>

                <button
                  type="button"
                  className="mt-5 w-full text-center text-[20px] text-white/90 hover:text-white transition"
                  onClick={() => closeSongSheet()}
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
                    onClick={() => setShowSongPlaylistPicker(false)}
                  >
                    ←
                  </button>
                  <div className="min-w-0 text-center flex-1">
                    <div className="truncate text-base font-medium">
                      {toDisplayTrackTitle(songSheetTrack.title)}
                    </div>
                    <div className="truncate text-xs text-white/50">
                      {songSheetTrack.venueText}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-base text-white/70 hover:text-white"
                    onClick={() => closeSongSheet()}
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
                      if (!songSheetTrack.url) return;
                      const id = createPlaylist(songNewPlaylistName || "New playlist");
                      addTrackToPlaylist(id, {
                        title: toDisplayTrackTitle(songSheetTrack.title),
                        url: songSheetTrack.url,
                        length: songSheetTrack.length,
                        track: songSheetTrack.track,
                      });
                      setSongPlaylistActionState((prev) => ({ ...prev, [id]: "added" }));
                      closeSongSheet();
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
                        const canonical = toDisplayTrackTitle(songSheetTrack.title).toLowerCase();
                        const slot = p.slots.find((s) => s.canonicalTitle === canonical);
                        const alreadyExact = Boolean(
                          slot?.variants.some((v) => v.track.url === songSheetTrack.url),
                        );
                        const actionState = songPlaylistActionState[p.id];
                        const tracksCount = p.slots.length;
                        const versionsCount = p.slots.reduce(
                          (sum, s) => sum + s.variants.length,
                          0,
                        );
                        const linksCount = p.slots.filter((s) => s.variants.length > 1).length;
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl border border-white/10 bg-white/3 px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm">{p.name}</div>
                                <div className="mt-0.5 text-[11px] text-white/50">
                                  {tracksCount} Tracks • {versionsCount} Versions • {linksCount} Links
                                </div>
                              </div>

                              {alreadyExact ? (
                                <span className="text-xs text-emerald-300">Added!</span>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15 transition"
                                  disabled={!songSheetTrack.url}
                                  onClick={() => {
                                    if (!songSheetTrack.url) return;
                                    const out = addTrackToPlaylist(p.id, {
                                      title: toDisplayTrackTitle(songSheetTrack.title),
                                      url: songSheetTrack.url,
                                      length: songSheetTrack.length,
                                      track: songSheetTrack.track,
                                    });
                                    setSongPlaylistActionState((prev) => ({
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
                                {toDisplayTrackTitle(songSheetTrack.title)} is already on this
                                playlist. Add will merge versions.
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
                  onClick={() => setShowSongPlaylistPicker(false)}
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
