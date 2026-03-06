"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlay,
  faCircleCheck,
  faSpinner,
  faBookmark,
  faHeart,
  faChevronLeft,
  faChevronRight,
  faChevronDown,
  faEllipsisVertical,
  faMagnifyingGlass,
  faSliders,
  faSquare,
  faSquareCheck,
  faXmark,
} from "@fortawesome/pro-solid-svg-icons";
import {
  faCircleCheck as faCircleCheckRegular,
  faHeart as faHeartRegular,
} from "@fortawesome/free-regular-svg-icons";
import { faToggleOff, faToggleOn } from "@fortawesome/free-solid-svg-icons";
import { usePlayer, type Track } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";
import { shouldUseDefaultArtwork } from "@/utils/archiveArtwork";
import { logPlayedPlaylist, logPlayedShow, logPlayedSong } from "@/utils/activityFeed";

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
type MicrotonalityShowItem = ShowItem & {
  microtonalMatchCount: number;
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
  artwork?: string;
};
type SongSuggestion = {
  title: string;
  count: number;
  lastPlayedDate: string;
};
type ShowSuggestion = {
  showKey: string;
  title: string;
  subtitle: string;
  lastPlayedDate: string;
};
type HomeShowsCachePayload = {
  savedAt: number;
  sort: string;
  items: ShowItem[];
  hasMore: boolean;
  venueTotal: number;
  songItems: ShowItem[];
  songTotal: number;
  facets?: {
    years?: { value: string; count: number }[];
    continents?: { value: string; count: number }[];
    showTypes?: { value: string; count: number }[];
    albums?: { value: string; count: number }[];
    albumShowKeys?: Record<string, string[]>;
    albumUniverseCount?: number;
  };
};
type DiscoveryRowsCachePayload = {
  savedAt: number;
  takingFlightShows: ShowItem[];
  dripDripShows: ShowItem[];
  jamSpamShows: ShowItem[];
  microtonalityShows: MicrotonalityShowItem[];
};

const SHOW_TYPE_OPTIONS = [
  { value: "Rave" },
  { value: "Acoustic" },
  { value: "Orchestra" },
  { value: "Standard" },
];
const DISCOGRAPHY_ALBUM_OPTIONS = [
  "12 Bar Bruise",
  "Eyes Like The Sky",
  "Float Along - Fill Your Lungs",
  "Oddments",
  "I'm In Your Mind Fuzz",
  "Quarters!",
  "Paper Mache Dream Balloon",
  "Nonagon Infinity",
  "Flying Microtonal Banana",
  "Murder of the Universe",
  "Sketches of Brunswick East",
  "Polygondwanaland",
  "Gumboot Soup",
  "Fishing For Fishies",
  "Infest the Rats' Nest",
  "K.G.",
  "L.W.",
  "Butterfly 3000",
  "Made In Timeland",
  "Omnium Gatherum",
  "Ice, Death, Planets, Lungs, Mushrooms and Lava",
  "Laminated Denim",
  "Changes",
  "PetroDragonic Apocalypse",
  "The Silver Chord",
  "The Silver Chord (Extended Mix)",
  "Flight B741",
  "Phantom Island",
];

const FAVORITE_SHOWS_KEY = "kglw.favoriteShows.v1";
const RECENT_SHOWS_KEY = "kglw.recentShows.v1";
const HEARD_SHOWS_KEY = "kglw.heardShows.v1";
const LOVED_SONGS_PLAYLIST_NAME = "Loved Songs";
const SHOW_STATS_CACHE_KEY = "kglw.showStats.v3";
const HOME_SHOWS_CACHE_KEY = "kglw.homeShows.v3";
const HOME_SHOWS_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
const DISCOVERY_ROWS_CACHE_KEY = "kglw.discoveryRows.v1";
const DISCOVERY_ROWS_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
const DEFAULT_ARTWORK_SRC = "/api/default-artwork";
const PREBUILT_PLAYLIST_NAME_SET = new Set([
  "flight b741 live comp.",
  "i'm in your mind fuzz live comp.",
  "infest the rats' nest",
  "i'm in your mind fuzz",
  "nonagon infinity",
  "petrodragonic apocalypse",
  "the silver chord",
]);
const JAM_SPAM_SONGS = [
  "The Dripping Tap",
  "Head On/Pill",
  "Hypertension",
  "The River",
  "Magma",
  "Iron Lung",
  "Ice V",
];
const MICROTONALITY_SONGS = [
  "If Not Now, Then When?",
  "O.N.E.",
  "Pleura",
  "Supreme Ascendancy",
  "Static Electricity",
  "East West Link",
  "Ataraxia",
  "See Me",
  "K.G.L.W.",
  "Automation",
  "Minimum Brain Size",
  "Straws In The Wind",
  "Some Of Us",
  "Ontology",
  "Intrasport",
  "Oddlife",
  "Honey",
  "The Hungry Wolf Of Fate",
  "Greenhouse Heat Death",
  "All Is Known",
  "D-Day",
  "The Book",
  "Rattlesnake",
  "Melting",
  "Open Water",
  "Sleep Drifter",
  "Billabong Valley",
  "Anoxia",
  "Doom City",
  "Nuclear Fusion",
  "Flying Microtonal Banana",
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most_played", label: "Most played" },
  { value: "least_played", label: "Least played" },
  { value: "show_length_longest", label: "Longest show" },
  { value: "show_length_shortest", label: "Shortest show" },
];

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
  // Prefer browser-friendly formats first for reliable playback.
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
    showTypes?: { value: string; count: number }[];
    albums?: { value: string; count: number }[];
    albumShowKeys?: Record<string, string[]>;
    albumUniverseCount?: number;
  };
};

function summarizeSelection(values: string[], emptyLabel = "All") {
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]}, ${values[1]}`;
  return `${values[0]}, ${values[1]} +${values.length - 2}`;
}

function countIntersection(sets: Set<string>[]): number {
  if (sets.length === 0) return 0;
  const ordered = sets.slice().sort((a, b) => a.size - b.size);
  const [smallest, ...rest] = ordered;
  let count = 0;
  for (const value of smallest) {
    if (rest.every((s) => s.has(value))) count += 1;
  }
  return count;
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

function tokenizeSearchInput(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

function tokenPrefixMatch(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const words = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return false;
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

function queryMatchesByTokens(text: string, query: string): boolean {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = String(text || "").toLowerCase();
  if (hay.includes(q)) return true;
  const tokens = tokenizeSearchInput(q);
  if (tokens.length === 0) return false;
  return tokenPrefixMatch(hay, tokens);
}

function relevanceScore(text: string, query: string): number {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return 0;
  const t = String(text || "").toLowerCase().trim();
  if (!t) return 0;
  if (t === q) return 5;
  if (t.startsWith(q)) return 4;
  if (t.includes(q)) return 3;
  if (queryMatchesByTokens(t, q)) return 2;
  return 0;
}

function MultiSelectDropdown(props: {
  id: string;
  label: string;
  options: { value: string; count?: number }[];
  value: string[];
  onChange: (next: string[]) => void;
  minWidthClass?: string;
  emptyLabel?: string;
  getOptionCount?: (optionValue: string, draft: string[]) => number | undefined;
  getApplyCount?: (draft: string[]) => number | undefined;
}) {
  const {
    id,
    label,
    options,
    value,
    onChange,
    minWidthClass,
    emptyLabel,
    getOptionCount,
    getApplyCount,
  } = props;

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
  const panelTitle = emptyLabel || label || "Filter";
  const totalCount = options.reduce(
    (sum, opt) => sum + (typeof opt.count === "number" ? opt.count : 0),
    0,
  );
  const draftCount =
    draft.length === 0
      ? totalCount
      : options.reduce(
          (sum, opt) =>
            draft.includes(opt.value) && typeof opt.count === "number"
              ? sum + opt.count
              : sum,
          0,
        );
  const contextualApplyCount = getApplyCount?.(draft);

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
        className={`w-full text-left transition ${
          value.length > 0
            ? "rounded-[8px] border border-white/30 bg-[rgba(48,26,89,0.65)] px-[14px] py-[10px] text-[12px] text-white"
            : "rounded-[8px] border border-white/30 bg-transparent px-[14px] py-[10px] text-[12px] text-white hover:border-white/45"
        }`}
        onClick={() => {
          setDraft(value);
          setOpen((v) => !v);
        }}
      >
        {value.length > 0 ? (
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-[6px]">
              <span className="inline-flex h-[18px] min-w-[15px] items-center justify-center rounded-[4px] bg-[#5a22c9] px-1 text-[12px] font-semibold text-white">
                {value.length}
              </span>
              <span className="text-[12px] text-white">{emptyLabel || label || "Selected"}</span>
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${emptyLabel || label || "filter"}`}
              className="inline-flex items-center"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
                setDraft([]);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
                setDraft([]);
                setOpen(false);
              }}
            >
              <FontAwesomeIcon icon={faXmark} className="text-[12px] text-white" />
            </span>
          </span>
        ) : (
          <span className="block truncate">{summary}</span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close filter panel"
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => {
              setOpen(false);
              setDraft(value);
            }}
          />
          <div
            id={`${id}-panel`}
            role="dialog"
            aria-label={`${panelTitle} filter`}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[393px] rounded-t-[16px] border border-white/15 bg-[#080017] px-6 pb-8 pt-4 shadow-[0_-4px_4px_rgba(0,0,0,0.25)]"
          >
            <div className="mx-auto h-[4px] w-[53px] rounded-[16px] bg-white/30" />
            <div className="mt-6 text-[24px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
              {panelTitle}
            </div>

            {draft.length === 0 ? (
              <div className="mt-4 flex h-[35px] items-center justify-center rounded-[8px] bg-black/30 text-[14px] text-white/60 [font-family:var(--font-roboto-condensed)]">
                No filters selected
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-start justify-center gap-2">
                {draft.map((selected) => (
                  <button
                    key={selected}
                    type="button"
                    className="inline-flex items-center gap-3 rounded-[12px] bg-[rgba(48,26,89,0.25)] px-3 py-2 text-[16px] text-white [font-family:var(--font-roboto-condensed)]"
                    onClick={() => {
                      setDraft((prev) => prev.filter((v) => v !== selected));
                    }}
                  >
                    <span>{selected}</span>
                    <FontAwesomeIcon icon={faXmark} className="text-[12px]" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 max-h-[44vh] space-y-2 overflow-auto pr-1">
              {options.map((opt) => {
                const checked = draft.includes(opt.value);
                const contextualCount = getOptionCount?.(opt.value, draft);
                const displayCount =
                  typeof contextualCount === "number" ? contextualCount : opt.count;
                const visibleCount =
                  typeof displayCount === "number"
                    ? displayCount
                    : typeof opt.count === "number"
                      ? opt.count
                      : 0;
                const disabled = !checked && typeof displayCount === "number" && displayCount <= 0;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-[12px] px-4 py-4 text-left ${
                      checked
                        ? "bg-[rgba(48,26,89,0.65)] text-white"
                        : disabled
                          ? "bg-[rgba(48,26,89,0.15)] text-white/45"
                          : "bg-[rgba(48,26,89,0.25)] text-white"
                    }`}
                    disabled={disabled}
                    onClick={() => {
                      setDraft((prev) =>
                        prev.includes(opt.value)
                          ? prev.filter((v) => v !== opt.value)
                          : prev.concat(opt.value),
                      );
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <FontAwesomeIcon
                        icon={checked ? faSquareCheck : faSquare}
                        className={`text-[18px] ${checked ? "text-white" : "text-white/40"}`}
                      />
                      <span className="truncate text-[16px] text-white [font-family:var(--font-roboto-condensed)]">
                        {opt.value}
                      </span>
                    </span>
                    <span className="text-[16px] text-white [font-family:var(--font-roboto-condensed)]">
                      {visibleCount}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-6">
              <button
                type="button"
                className="flex h-[57px] w-full items-center justify-between rounded-[12px] bg-[#5a22c9] px-4 py-2 text-white"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                <span className="text-[16px] font-semibold [font-family:var(--font-roboto-condensed)]">
                  Apply Filters
                </span>
                <span className="text-[14px] [font-family:var(--font-roboto-condensed)]">
                  {(typeof contextualApplyCount === "number" ? contextualApplyCount : draftCount)} Shows
                </span>
              </button>
              <button
                type="button"
                className="block w-full text-center text-[14px] text-white/90 [font-family:var(--font-roboto-condensed)] hover:text-white"
                onClick={() => {
                  setOpen(false);
                  setDraft(value);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function HomePage({ showOnlyShows = false }: { showOnlyShows?: boolean }) {
  const router = useRouter();
  const setQueue = usePlayer((s) => s.setQueue);
  const playerLoading = usePlayer((s) => s.loading);
  const playlists = usePlaylists((s) => s.playlists);
  const syncPrebuiltPlaylistsFromServer = usePlaylists((s) => s.syncPrebuiltPlaylistsFromServer);
  const addTrackToPlaylist = usePlaylists((s) => s.addTrack);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);
  const renamePlaylist = usePlaylists((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);

  const [shows, setShows] = useState<ShowItem[]>([]);
  const [songShows, setSongShows] = useState<ShowItem[]>([]);
  const [songTotal, setSongTotal] = useState(0);
  const [venueTotal, setVenueTotal] = useState(0);
  const [resultFilter, setResultFilter] = useState<"shows" | "venues">("venues");
  const [songLengthSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [years, setYears] = useState<string[]>([]);
  const [continents, setContinents] = useState<string[]>([]);
  const [showTypes, setShowTypes] = useState<string[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [yearFacet, setYearFacet] = useState<
    { value: string; count: number }[]
  >([]);
  const [continentFacet, setContinentFacet] = useState<
    { value: string; count: number }[]
  >([]);
  const [showTypeFacet, setShowTypeFacet] = useState<
    { value: string; count: number }[]
  >([]);
  const [albumFacet, setAlbumFacet] = useState<
    { value: string; count: number }[]
  >([]);
  const [albumShowKeysFacet, setAlbumShowKeysFacet] = useState<Record<string, string[]>>({});
  const [albumUniverseCount, setAlbumUniverseCount] = useState(0);
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const [showTab, setShowTab] = useState<"all" | "recent" | "favorites">("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [favoriteShows, setFavoriteShows] = useState<string[]>([]);
  const [heardShows, setHeardShows] = useState<string[]>([]);
  const [hideHeardShows, setHideHeardShows] = useState(false);
  const [recentShows, setRecentShows] = useState<string[]>([]);
  const [statsById, setStatsById] = useState<Record<string, ShowPlaybackStats>>({});
  const inFlightStatsIdsRef = useRef<Set<string>>(new Set());
  const queueByIdentifierRef = useRef<Record<string, Track[]>>({});
  const inFlightQueueByIdentifierRef = useRef<Record<string, Promise<Track[]>>>({});
  const prewarmedShowKeysRef = useRef<Set<string>>(new Set());
  const resolvedShowIdsRef = useRef<Record<string, string>>({});
  const playPendingRef = useRef<Set<string>>(new Set());
  const [songSheetTrack, setSongSheetTrack] = useState<SongSheetTrack | null>(null);
  const [showSongPlaylistPicker, setShowSongPlaylistPicker] = useState(false);
  const [songSearchLoading, setSongSearchLoading] = useState(false);
  const [searchVenueShows, setSearchVenueShows] = useState<ShowItem[]>([]);
  const [takingFlightShows, setTakingFlightShows] = useState<ShowItem[]>([]);
  const [dripDripShows, setDripDripShows] = useState<ShowItem[]>([]);
  const [jamSpamShows, setJamSpamShows] = useState<ShowItem[]>([]);
  const [microtonalityShows, setMicrotonalityShows] = useState<MicrotonalityShowItem[]>([]);
  const [takingFlightLoading, setTakingFlightLoading] = useState(true);
  const [dripDripLoading, setDripDripLoading] = useState(true);
  const [jamSpamLoading, setJamSpamLoading] = useState(true);
  const [microtonalityLoading, setMicrotonalityLoading] = useState(true);
  const [songShareState, setSongShareState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [songPlaylistActionState, setSongPlaylistActionState] = useState<
    Record<string, "added" | "exists" | undefined>
  >({});
  const [songNewPlaylistName, setSongNewPlaylistName] = useState("");
  const [requestedPlaylistId, setRequestedPlaylistId] = useState<string | null>(null);
  const [clientHydrated, setClientHydrated] = useState(false);
  const [playlistRenameTarget, setPlaylistRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [playlistRenameValue, setPlaylistRenameValue] = useState("");
  const [playlistDeleteTarget, setPlaylistDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const compCarouselRef = useRef<HTMLDivElement | null>(null);
  const takingFlightCarouselRef = useRef<HTMLDivElement | null>(null);
  const dripDripCarouselRef = useRef<HTMLDivElement | null>(null);
  const jamSpamCarouselRef = useRef<HTMLDivElement | null>(null);
  const compDraggingRef = useRef(false);
  const compDragStartXRef = useRef(0);
  const compDragStartScrollLeftRef = useRef(0);
  const takingFlightDraggingRef = useRef(false);
  const takingFlightDragStartXRef = useRef(0);
  const takingFlightDragStartScrollLeftRef = useRef(0);
  const dripDripDraggingRef = useRef(false);
  const dripDripDragStartXRef = useRef(0);
  const dripDripDragStartScrollLeftRef = useRef(0);
  const jamSpamDraggingRef = useRef(false);
  const jamSpamDragStartXRef = useRef(0);
  const jamSpamDragStartScrollLeftRef = useRef(0);
  const [canScrollCompsPrev, setCanScrollCompsPrev] = useState(false);
  const [canScrollCompsNext, setCanScrollCompsNext] = useState(false);
  const [canScrollTakingFlightPrev, setCanScrollTakingFlightPrev] = useState(false);
  const [canScrollTakingFlightNext, setCanScrollTakingFlightNext] = useState(false);
  const [canScrollDripDripPrev, setCanScrollDripDripPrev] = useState(false);
  const [canScrollDripDripNext, setCanScrollDripDripNext] = useState(false);
  const [canScrollJamSpamPrev, setCanScrollJamSpamPrev] = useState(false);
  const [canScrollJamSpamNext, setCanScrollJamSpamNext] = useState(false);
  const didHydrateInitialShowsRef = useRef(false);
  const didRunFilterReloadRef = useRef(false);

  function buildUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    for (const y of years) params.append("year", y);
    for (const c of continents) params.append("continent", c);
    for (const t of showTypes) params.append("showType", t);
    for (const a of albums) params.append("album", a);
    params.set("sort", sort);
    return `/api/ia/shows?${params.toString()}`; // IMPORTANT: use /api/ia/shows
  }

  function buildSongSearchUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    for (const y of years) params.append("year", y);
    for (const c of continents) params.append("continent", c);
    for (const t of showTypes) params.append("showType", t);
    for (const a of albums) params.append("album", a);
    params.set("query", debouncedQuery);
    params.set("sort", sort);
    return `/api/ia/shows?${params.toString()}`;
  }

  function buildAlbumFacetsUrl() {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("fast", "1");
    for (const y of years) params.append("year", y);
    for (const c of continents) params.append("continent", c);
    for (const t of showTypes) params.append("showType", t);
    if (debouncedQuery) params.set("query", debouncedQuery);
    params.set("sort", sort);
    params.set("includeAlbumFacets", "1");
    return `/api/ia/shows?${params.toString()}`;
  }

  function canUseHomeCacheForCurrentFilters() {
    return (
      years.length === 0 &&
      continents.length === 0 &&
      showTypes.length === 0 &&
      albums.length === 0 &&
      !debouncedQuery &&
      sort === "newest"
    );
  }

  async function fetchShowsWithRetry(url: string, baseTimeoutMs = 10000): Promise<Response | null> {
    for (const timeoutMs of [baseTimeoutMs, baseTimeoutMs + 5000]) {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) return res;
      } catch {
        // Retry once with a longer timeout.
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    return null;
  }

  async function loadPage(p: number, mode: "append" | "replace") {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchShowsWithRetry(buildUrl(p));
      if (!res) throw new Error("Request failed");
      const data = (await res.json()) as ShowsResponse;
      const hasAlbumFacetData =
        Object.keys(data.facets?.albumShowKeys || {}).length > 0;

      if (data.facets?.years) setYearFacet(data.facets.years);
      if (data.facets?.continents) setContinentFacet(data.facets.continents);
      if (data.facets?.showTypes) setShowTypeFacet(data.facets.showTypes);
      if (hasAlbumFacetData) {
        if (data.facets?.albums) setAlbumFacet(data.facets.albums);
        setAlbumShowKeysFacet(data.facets?.albumShowKeys || {});
        setAlbumUniverseCount(Number(data.facets?.albumUniverseCount || 0));
      }
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
      if (p === 1 && mode === "replace" && canUseHomeCacheForCurrentFilters()) {
        const payload: HomeShowsCachePayload = {
          savedAt: Date.now(),
          sort,
          items: data.items || [],
          hasMore: Boolean(data.hasMore),
          venueTotal: data.venueTotal || 0,
          songItems: data.song?.items || [],
          songTotal: data.song?.total || 0,
          facets: data.facets,
        };
        try {
          localStorage.setItem(HOME_SHOWS_CACHE_KEY, JSON.stringify(payload));
        } catch {
          // Ignore storage quota / serialization errors.
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
      else setError("Failed to load shows");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setClientHydrated(true);
  }, []);
  useEffect(() => {
    if (!playerLoading) setRequestedPlaylistId(null);
  }, [playerLoading]);

  useEffect(() => {
    if (didHydrateInitialShowsRef.current) {
      loadPage(1, "replace");
      return;
    }
    didHydrateInitialShowsRef.current = true;
    let hydrated = false;
    try {
      const raw = localStorage.getItem(HOME_SHOWS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HomeShowsCachePayload;
        const isFresh =
          typeof parsed?.savedAt === "number" &&
          Date.now() - parsed.savedAt <= HOME_SHOWS_CACHE_MAX_AGE_MS;
        const validItems = Array.isArray(parsed?.items) ? parsed.items : [];
        if (
          isFresh &&
          parsed?.sort === "newest" &&
          validItems.length > 0 &&
          canUseHomeCacheForCurrentFilters()
        ) {
          const hasAlbumFacetData =
            Object.keys(parsed.facets?.albumShowKeys || {}).length > 0;
          hydrated = true;
          setShows(validItems);
          setHasMore(Boolean(parsed.hasMore));
          setPage(1);
          setVenueTotal(Number(parsed.venueTotal || 0));
          setSongShows(Array.isArray(parsed.songItems) ? parsed.songItems : []);
          setSongTotal(Number(parsed.songTotal || 0));
          if (parsed.facets?.years) setYearFacet(parsed.facets.years);
          if (parsed.facets?.continents) setContinentFacet(parsed.facets.continents);
          if (parsed.facets?.showTypes) setShowTypeFacet(parsed.facets.showTypes);
          if (hasAlbumFacetData) {
            if (parsed.facets?.albums) setAlbumFacet(parsed.facets.albums);
            setAlbumShowKeysFacet(parsed.facets?.albumShowKeys || {});
            setAlbumUniverseCount(Number(parsed.facets?.albumUniverseCount || 0));
          }
        }
      }
    } catch {
      // Ignore bad cache payload and fetch normally.
    }
    if (!hydrated) loadPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const favRaw = localStorage.getItem(FAVORITE_SHOWS_KEY);
      const recRaw = localStorage.getItem(RECENT_SHOWS_KEY);
      const heardRaw = localStorage.getItem(HEARD_SHOWS_KEY);
      const favParsed = JSON.parse(favRaw || "[]");
      const recParsed = JSON.parse(recRaw || "[]");
      const heardParsed = JSON.parse(heardRaw || "[]");
      setFavoriteShows(Array.isArray(favParsed) ? favParsed : []);
      setRecentShows(Array.isArray(recParsed) ? recParsed : []);
      setHeardShows(Array.isArray(heardParsed) ? heardParsed : []);
    } catch {
      setFavoriteShows([]);
      setRecentShows([]);
      setHeardShows([]);
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
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const root = sortMenuRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setSortMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSortMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (showOnlyShows) {
      setTakingFlightLoading(false);
      setDripDripLoading(false);
      setJamSpamLoading(false);
      setMicrotonalityLoading(false);
      return;
    }
    try {
      const raw = localStorage.getItem(DISCOVERY_ROWS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DiscoveryRowsCachePayload;
        const isFresh =
          typeof parsed?.savedAt === "number" &&
          Date.now() - parsed.savedAt <= DISCOVERY_ROWS_CACHE_MAX_AGE_MS;
        if (isFresh) {
          const cachedTakingFlight = Array.isArray(parsed?.takingFlightShows)
            ? parsed.takingFlightShows
            : [];
          const cachedDripDrip = Array.isArray(parsed?.dripDripShows)
            ? parsed.dripDripShows
            : [];
          const cachedJamSpam = Array.isArray(parsed?.jamSpamShows)
            ? parsed.jamSpamShows
            : [];
          const cachedMicrotonality = Array.isArray(parsed?.microtonalityShows)
            ? parsed.microtonalityShows
            : [];
          if (
            cachedTakingFlight.length > 0 ||
            cachedDripDrip.length > 0 ||
            cachedJamSpam.length > 0 ||
            cachedMicrotonality.length > 0
          ) {
            setTakingFlightShows(cachedTakingFlight);
            setDripDripShows(cachedDripDrip);
            setJamSpamShows(cachedJamSpam);
            setMicrotonalityShows(cachedMicrotonality);
            setTakingFlightLoading(false);
            setDripDripLoading(false);
            setJamSpamLoading(false);
            setMicrotonalityLoading(false);
            return;
          }
        }
      }
    } catch {
      // Ignore bad cache payload and fetch normally.
    }
    let alive = true;
    async function loadDiscoveryRows() {
      setTakingFlightLoading(true);
      setDripDripLoading(true);
      setJamSpamLoading(true);
      setMicrotonalityLoading(true);
      const DISCOVERY_TIMEOUT_MS = 12000;
      let nextTakingFlightShows: ShowItem[] = [];
      let nextDripDripShows: ShowItem[] = [];
      let nextJamSpamShows: ShowItem[] = [];
      let nextMicrotonalityShows: MicrotonalityShowItem[] = [];
      const buildDiscoveryUrl = (options: {
        sort: "most_played" | "newest";
        query?: string;
        album?: string;
      }) => {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("sort", options.sort);
        params.set("fast", "1");
        if (options.query) params.set("query", options.query);
        if (options.album) params.set("album", options.album);
        return `/api/ia/shows?${params.toString()}`;
      };

      const fetchDiscoveryResponse = async (options: {
        query?: string;
        album?: string;
      }): Promise<ShowsResponse | null> => {
        const primary = buildDiscoveryUrl({ ...options, sort: "most_played" });
        const fallback = buildDiscoveryUrl({ ...options, sort: "newest" });
        const firstRes = await fetchShowsWithRetry(primary, DISCOVERY_TIMEOUT_MS);
        const chosenRes = firstRes || (await fetchShowsWithRetry(fallback, DISCOVERY_TIMEOUT_MS));
        if (!chosenRes) return null;
        return (await chosenRes.json()) as ShowsResponse;
      };
      let popularFallbackPromise: Promise<ShowItem[]> | null = null;
      const getPopularFallback = async (): Promise<ShowItem[]> => {
        if (!popularFallbackPromise) {
          popularFallbackPromise = (async () => {
            const primary = buildDiscoveryUrl({ sort: "most_played" });
            const fallback = buildDiscoveryUrl({ sort: "newest" });
            const res =
              (await fetchShowsWithRetry(primary, DISCOVERY_TIMEOUT_MS)) ||
              (await fetchShowsWithRetry(fallback, DISCOVERY_TIMEOUT_MS));
            if (!res) return [];
            const data = (await res.json()) as ShowsResponse;
            return Array.isArray(data?.items) ? data.items : [];
          })();
        }
        return popularFallbackPromise;
      };

      const takingFlightTask = (async () => {
        try {
          const takingFlightData = await fetchDiscoveryResponse({
            album: "Flight b741",
          });
          if (!alive) return;
          const takingFlightItems = Array.isArray(takingFlightData?.items)
            ? takingFlightData.items
            : [];
          const withPlays = takingFlightItems.filter((s) => Number(s.plays || 0) > 0);
          const selected = (withPlays.length > 0 ? withPlays : takingFlightItems).slice(0, 10);
          if (selected.length > 0) {
            nextTakingFlightShows = selected;
            setTakingFlightShows(selected);
            return;
          }
          const fallbackItems = (await getPopularFallback()).slice(0, 10);
          nextTakingFlightShows = fallbackItems;
          setTakingFlightShows(
            fallbackItems,
          );
        } catch {
          if (!alive) return;
          const fallbackItems = (await getPopularFallback()).slice(0, 10);
          nextTakingFlightShows = fallbackItems;
          setTakingFlightShows(fallbackItems);
        } finally {
          if (!alive) return;
          setTakingFlightLoading(false);
        }
      })();

      const dripDripTask = (async () => {
        try {
          const dripDripData = await fetchDiscoveryResponse({
            query: "The Dripping Tap",
          });
          if (!alive) return;
          const dripItems = Array.isArray(dripDripData?.song?.items)
            ? dripDripData.song.items
            : Array.isArray(dripDripData?.items)
              ? dripDripData.items
              : [];
          if (dripItems.length > 0) {
            const selected = dripItems.slice(0, 10);
            nextDripDripShows = selected;
            setDripDripShows(selected);
            return;
          }
          const fallbackItems = (await getPopularFallback()).slice(8, 18);
          nextDripDripShows = fallbackItems;
          setDripDripShows(fallbackItems);
        } catch {
          if (!alive) return;
          const fallbackItems = (await getPopularFallback()).slice(8, 18);
          nextDripDripShows = fallbackItems;
          setDripDripShows(fallbackItems);
        } finally {
          if (!alive) return;
          setDripDripLoading(false);
        }
      })();

      const jamSpamTask = (async () => {
        try {
          const jamSpamData = await Promise.all(
            JAM_SPAM_SONGS.map((song) =>
              fetchDiscoveryResponse({ query: song }),
            ),
          );
          const byShow = new Map<string, ShowItem>();
          for (const payload of jamSpamData) {
            const items = Array.isArray(payload?.song?.items)
              ? payload.song.items
              : Array.isArray(payload?.items)
                ? payload.items
                : [];
            for (const item of items) {
              const prev = byShow.get(item.showKey);
              const currentSec =
                typeof item.matchedSongSeconds === "number" ? item.matchedSongSeconds : -1;
              const prevSec =
                typeof prev?.matchedSongSeconds === "number" ? prev.matchedSongSeconds : -1;
              if (!prev || currentSec > prevSec) byShow.set(item.showKey, item);
            }
          }
          const ranked = Array.from(byShow.values())
            .sort((a, b) => {
              const aSec = typeof a.matchedSongSeconds === "number" ? a.matchedSongSeconds : -1;
              const bSec = typeof b.matchedSongSeconds === "number" ? b.matchedSongSeconds : -1;
              if (bSec !== aSec) return bSec - aSec;
              return Number(b.plays || 0) - Number(a.plays || 0);
            })
            .slice(0, 12);
          if (!alive) return;
          if (ranked.length > 0) {
            nextJamSpamShows = ranked;
            setJamSpamShows(ranked);
            return;
          }
          const fallbackItems = (await getPopularFallback()).slice(16, 28);
          nextJamSpamShows = fallbackItems;
          setJamSpamShows(fallbackItems);
        } catch {
          if (!alive) return;
          const fallbackItems = (await getPopularFallback()).slice(16, 28);
          nextJamSpamShows = fallbackItems;
          setJamSpamShows(fallbackItems);
        } finally {
          if (!alive) return;
          setJamSpamLoading(false);
        }
      })();

      const microtonalityTask = (async () => {
        try {
          const microtonalitySeedSongs = MICROTONALITY_SONGS.slice(0, 12);
          const payloads: Array<ShowsResponse | null> = [];
          for (let i = 0; i < microtonalitySeedSongs.length; i += 4) {
            const chunk = microtonalitySeedSongs.slice(i, i + 4);
            const chunkPayloads = await Promise.all(
              chunk.map((song) => fetchDiscoveryResponse({ query: song })),
            );
            payloads.push(...chunkPayloads);
          }

          const byShow = new Map<string, { item: ShowItem; songs: Set<string> }>();
          for (let i = 0; i < payloads.length; i += 1) {
            const songTitle = microtonalitySeedSongs[i];
            const songKey = songTitle.toLowerCase();
            const payload = payloads[i];
            const items = Array.isArray(payload?.song?.items)
              ? payload.song.items
              : Array.isArray(payload?.items)
                ? payload.items
                : [];
            for (const item of items) {
              const existing = byShow.get(item.showKey);
              if (!existing) {
                byShow.set(item.showKey, { item, songs: new Set([songKey]) });
                continue;
              }
              existing.songs.add(songKey);
              const currentSec =
                typeof item.matchedSongSeconds === "number" ? item.matchedSongSeconds : -1;
              const existingSec =
                typeof existing.item.matchedSongSeconds === "number"
                  ? existing.item.matchedSongSeconds
                  : -1;
              if (currentSec > existingSec) {
                existing.item = item;
              }
            }
          }

          const ranked = Array.from(byShow.values())
            .map(({ item, songs }) => ({
              ...item,
              microtonalMatchCount: songs.size,
            }))
            .sort((a, b) => {
              if (b.microtonalMatchCount !== a.microtonalMatchCount) {
                return b.microtonalMatchCount - a.microtonalMatchCount;
              }
              return Number(b.plays || 0) - Number(a.plays || 0);
            })
            .slice(0, 12);

          if (!alive) return;
          if (ranked.length > 0) {
            nextMicrotonalityShows = ranked;
            setMicrotonalityShows(ranked);
            return;
          }
          const fallbackItems = (await getPopularFallback())
            .slice(22, 34)
            .map((item) => ({ ...item, microtonalMatchCount: 0 }));
          nextMicrotonalityShows = fallbackItems;
          setMicrotonalityShows(fallbackItems);
        } catch {
          if (!alive) return;
          const fallbackItems = (await getPopularFallback())
            .slice(22, 34)
            .map((item) => ({ ...item, microtonalMatchCount: 0 }));
          nextMicrotonalityShows = fallbackItems;
          setMicrotonalityShows(fallbackItems);
        } finally {
          if (!alive) return;
          setMicrotonalityLoading(false);
        }
      })();

      await Promise.allSettled([takingFlightTask, dripDripTask, jamSpamTask, microtonalityTask]);
      if (!alive) return;
      try {
        const payload: DiscoveryRowsCachePayload = {
          savedAt: Date.now(),
          takingFlightShows: nextTakingFlightShows,
          dripDripShows: nextDripDripShows,
          jamSpamShows: nextJamSpamShows,
          microtonalityShows: nextMicrotonalityShows,
        };
        localStorage.setItem(DISCOVERY_ROWS_CACHE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore storage errors.
      }
    }
    void loadDiscoveryRows();
    return () => {
      alive = false;
    };
  }, [showOnlyShows]);
  useEffect(() => {
    if (!didRunFilterReloadRef.current) {
      didRunFilterReloadRef.current = true;
      return;
    }
    setShows([]);
    setHasMore(true);
    setPage(1);
    loadPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|"), continents.join("|"), showTypes.join("|"), albums.join("|"), sort]);

  useEffect(() => {
    let alive = true;
    async function loadAlbumFacets() {
      if (!advancedFiltersOpen) return;
      if (albums.length > 0) return;
      try {
        const res = await fetchShowsWithRetry(buildAlbumFacetsUrl());
        if (!res || !alive) return;
        const data = (await res.json()) as ShowsResponse;
        if (!alive) return;
        if (data.facets?.albums) setAlbumFacet(data.facets.albums);
        setAlbumShowKeysFacet(data.facets?.albumShowKeys || {});
        setAlbumUniverseCount(Number(data.facets?.albumUniverseCount || 0));
      } catch {
        // Keep current facet state on prefetch failure.
      }
    }
    void loadAlbumFacets();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    advancedFiltersOpen,
    years.join("|"),
    continents.join("|"),
    showTypes.join("|"),
    debouncedQuery,
    sort,
    albums.join("|"),
  ]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function runSongSearch() {
      if (!debouncedQuery || debouncedQuery.length < 3) {
        if (!alive) return;
        setSongSearchLoading(false);
        setSongShows([]);
        setSongTotal(0);
        setSearchVenueShows([]);
        return;
      }
      setSongSearchLoading(true);
      try {
        const res = await fetchShowsWithRetry(buildSongSearchUrl(1));
        if (!res) {
          if (alive) setSongSearchLoading(false);
          return;
        }
        const data = (await res.json()) as ShowsResponse;
        if (!alive) return;
        setSongShows(data.song?.items || []);
        setSongTotal(data.song?.total || 0);
        setSearchVenueShows(data.items || []);
      } catch {
        if (!alive || controller.signal.aborted) return;
        if (!alive) return;
        setSongShows([]);
        setSongTotal(0);
        setSearchVenueShows([]);
      } finally {
        if (alive) setSongSearchLoading(false);
      }
    }
    runSongSearch();
    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|"), continents.join("|"), showTypes.join("|"), albums.join("|"), debouncedQuery, sort]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResultFilter("venues");
      return;
    }
    if (resultFilter === "shows" && songTotal <= 0) {
      setResultFilter("venues");
    }
  }, [debouncedQuery, songTotal, resultFilter]);

  const canInfiniteLoad = !debouncedQuery;
  const hasActiveShowFilters =
    years.length > 0 || continents.length > 0 || showTypes.length > 0 || albums.length > 0;

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
  const availableShowTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of showTypeFacet) map.set(o.value, o.count);
    for (const o of SHOW_TYPE_OPTIONS) if (!map.has(o.value)) map.set(o.value, 0);
    for (const s of showTypes) if (!map.has(s)) map.set(s, 0);
    return SHOW_TYPE_OPTIONS.map((o) => ({ value: o.value, count: map.get(o.value) || 0 }));
  }, [showTypeFacet, showTypes]);
  const availableAlbums = useMemo(() => {
    const hasFacetCounts = albumFacet.some((o) => typeof o.count === "number" && o.count > 0);
    const map = new Map<string, number | undefined>();
    for (const title of DISCOGRAPHY_ALBUM_OPTIONS) map.set(title, undefined);
    for (const o of albumFacet) {
      map.set(o.value, hasFacetCounts ? o.count : undefined);
    }
    for (const a of albums) if (!map.has(a)) map.set(a, undefined);
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  }, [albumFacet, albums]);
  const albumShowKeySets = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const title of DISCOGRAPHY_ALBUM_OPTIONS) {
      const key = title.toLowerCase();
      map.set(key, new Set(albumShowKeysFacet[key] || []));
    }
    for (const [key, list] of Object.entries(albumShowKeysFacet)) {
      if (!map.has(key)) map.set(key, new Set(list || []));
    }
    return map;
  }, [albumShowKeysFacet]);
  const takingFlightCards = takingFlightShows;
  const showTakingFlightSkeleton = takingFlightLoading;
  const showDripDripSkeleton = dripDripLoading && dripDripShows.length === 0;
  const showJamSpamSkeleton = jamSpamLoading && jamSpamShows.length === 0;
  const showMicrotonalitySkeleton = microtonalityLoading && microtonalityShows.length === 0;
  const renderPrebuiltSkeletonCards = () =>
    Array.from({ length: 4 }, (_, idx) => (
      <div
        key={`prebuilt-skeleton-${idx}`}
        className="relative z-0 rounded-[16px] border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] p-3 backdrop-blur-[6px]"
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid w-20 shrink-0 grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }, (_unused, thumbIdx) => (
                <div
                  key={`prebuilt-skeleton-thumb-${idx}-${thumbIdx}`}
                  className="aspect-square w-full animate-pulse rounded-[8px] border border-white/15 bg-white/10"
                />
              ))}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/15" />
              <div className="h-3 w-full animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="ml-4 h-6 w-6 shrink-0 animate-pulse rounded-full bg-white/15" />
        </div>
      </div>
    ));
  const renderDiscoverySkeletonCards = (prefix: string) =>
    Array.from({ length: 3 }, (_, idx) => (
      <div
        key={`${prefix}-${idx}`}
        className="relative z-0 rounded-[16px] border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] p-3 backdrop-blur-[6px]"
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-[8px] border border-white/15 bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/15" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="ml-4 h-6 w-6 shrink-0 animate-pulse rounded-full bg-white/15" />
        </div>
      </div>
    ));
  const renderDiscoveryEmptyCard = (key: string, message: string) => (
    <div
      key={key}
      className="relative z-0 rounded-[16px] border border-white/15 bg-white/[0.03] p-3 backdrop-blur-[6px]"
    >
      <div className="text-[13px] text-white/75 [font-family:var(--font-roboto-condensed)]">
        {message}
      </div>
    </div>
  );
  const hasComputedAlbumFacetData = useMemo(
    () => Object.keys(albumShowKeysFacet).length > 0,
    [albumShowKeysFacet],
  );
  const getDiscographyOptionCount = useMemo(
    () => (optionValue: string, draft: string[]) => {
      if (!hasComputedAlbumFacetData || albumShowKeySets.size === 0) return undefined;
      const optionKey = String(optionValue || "").toLowerCase();
      const optionSet = albumShowKeySets.get(optionKey);
      if (!optionSet) return undefined;
      const selected = draft
        .map((v) => String(v || "").toLowerCase())
        .filter((v) => v !== optionKey);
      const sets = [optionSet];
      for (const key of selected) {
        const s = albumShowKeySets.get(key);
        if (!s) return undefined;
        sets.push(s);
      }
      return countIntersection(sets);
    },
    [albumShowKeySets, hasComputedAlbumFacetData],
  );
  const getDiscographyApplyCount = useMemo(
    () => (draft: string[]) => {
      if (!hasComputedAlbumFacetData) return venueTotal;
      const selected = draft.map((v) => String(v || "").toLowerCase());
      if (selected.length === 0) {
        return albumUniverseCount > 0 ? albumUniverseCount : venueTotal;
      }
      const sets: Set<string>[] = [];
      for (const key of selected) {
        const s = albumShowKeySets.get(key);
        if (!s) return 0;
        sets.push(s);
      }
      return countIntersection(sets);
    },
    [albumShowKeySets, albumUniverseCount, hasComputedAlbumFacetData, venueTotal],
  );

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
  const heardSet = useMemo(() => new Set(heardShows), [heardShows]);
  const recentSet = useMemo(() => new Set(recentShows), [recentShows]);

  const venueShows = useMemo(() => {
    let baseShows: ShowItem[] = shows;
    if (showTab === "favorites") {
      baseShows = shows.filter((s) => favoriteSet.has(s.showKey));
    }
    if (showTab === "recent") {
      const byKey = new Map(shows.map((s) => [s.showKey, s]));
      const ordered = recentShows
        .map((key) => byKey.get(key))
        .filter(Boolean) as ShowItem[];
      if (ordered.length > 0) {
        baseShows = ordered;
      } else {
        baseShows = shows.filter((s) => recentSet.has(s.showKey));
      }
    }
    if (!hideHeardShows) return baseShows;
    return baseShows.filter((s) => !heardSet.has(s.showKey));
  }, [shows, showTab, favoriteSet, recentSet, recentShows, hideHeardShows, heardSet]);
  const prebuiltPlaylists = useMemo(
    () =>
      playlists.filter(
        (p) =>
          p.source === "prebuilt" ||
          p.prebuiltKind === "album-live-comp" ||
          PREBUILT_PLAYLIST_NAME_SET.has(p.name.trim().toLowerCase()),
      ),
    [playlists],
  );
  const readyPrebuiltPlaylists = useMemo(
    () =>
      prebuiltPlaylists.filter((p) =>
        p.slots.some((slot) =>
          slot.variants.some((variant) => Boolean(String(variant.track.url || "").trim())),
        ),
      ),
    [prebuiltPlaylists],
  );
  const showPrebuiltSkeleton =
    !showOnlyShows && prebuiltPlaylists.length > 0 && readyPrebuiltPlaylists.length === 0;
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
  const lovedSongsPlaylist = useMemo(
    () =>
      playlists.find(
        (p) => p.name.trim().toLowerCase() === LOVED_SONGS_PLAYLIST_NAME.toLowerCase(),
      ) || null,
    [playlists],
  );
  const selectablePlaylists = useMemo(
    () =>
      playlists.filter(
        (p) => p.name.trim().toLowerCase() !== LOVED_SONGS_PLAYLIST_NAME.toLowerCase(),
      ),
    [playlists],
  );
  const isCurrentSongLoved = useMemo(() => {
    if (!songSheetTrack?.url || !lovedSongsPlaylist) return false;
    const canonical = toDisplayTrackTitle(songSheetTrack.title).toLowerCase();
    const slot = lovedSongsPlaylist.slots.find((s) => s.canonicalTitle === canonical);
    if (!slot) return false;
    return slot.variants.some((v) => v.track.url === songSheetTrack.url);
  }, [songSheetTrack, lovedSongsPlaylist]);
  const songShowsWithTrackTitle = useMemo(
    () =>
      sortedSongShows.filter((s) => String(s.matchedSongTitle || "").trim().length > 0),
    [sortedSongShows],
  );
  const topSongMatch = songShowsWithTrackTitle[0] || null;
  const songAvgMinutesLabel = useMemo(() => {
    const durations = songShowsWithTrackTitle
      .map((s) => s.matchedSongSeconds)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
    if (durations.length === 0) return "n/a";
    const avgSec = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const mins = Math.max(1, Math.round(avgSec / 60));
    return `${mins} min`;
  }, [songShowsWithTrackTitle]);
  const uniqueSongShowCount = useMemo(
    () => new Set(sortedSongShows.map((s) => s.showKey)).size,
    [sortedSongShows],
  );
  const songSuggestions = useMemo<SongSuggestion[]>(() => {
    const byTitle = new Map<string, SongSuggestion>();
    for (const s of songShowsWithTrackTitle) {
      const title = toDisplayTrackTitle(s.matchedSongTitle || "").trim();
      if (!title) continue;
      const key = title.toLowerCase();
      const existing = byTitle.get(key);
      if (existing) {
        existing.count += 1;
        if (String(s.showDate || "") > existing.lastPlayedDate) {
          existing.lastPlayedDate = String(s.showDate || "");
        }
        continue;
      }
      byTitle.set(key, {
        title,
        count: 1,
        lastPlayedDate: String(s.showDate || ""),
      });
    }
    // Metadata title resolution is intentionally bounded for responsiveness.
    // When the current query clearly matches one of the resolved titles,
    // reflect the full backend song-match total for that title.
    const queryTitle = toDisplayTrackTitle(debouncedQuery).trim();
    const queryNorm = normalizeSongText(queryTitle);
    if (queryNorm && songTotal > 0) {
      let bestKey: string | null = null;
      for (const [key, suggestion] of byTitle.entries()) {
        const titleNorm = normalizeSongText(suggestion.title);
        if (!titleNorm) continue;
        if (titleNorm === queryNorm) {
          bestKey = key;
          break;
        }
        if (!bestKey && (titleNorm.includes(queryNorm) || queryNorm.includes(titleNorm))) {
          bestKey = key;
        }
      }
      if (bestKey) {
        const current = byTitle.get(bestKey);
        if (current) current.count = Math.max(current.count, uniqueSongShowCount);
      }
    }
    return Array.from(byTitle.values())
      .sort((a, b) => {
        const aScore = relevanceScore(a.title, debouncedQuery);
        const bScore = relevanceScore(b.title, debouncedQuery);
        if (bScore !== aScore) return bScore - aScore;
        if (b.count !== a.count) return b.count - a.count;
        return b.lastPlayedDate.localeCompare(a.lastPlayedDate);
      })
      .slice(0, 6);
  }, [songShowsWithTrackTitle, debouncedQuery, songTotal, uniqueSongShowCount]);
  const songSuggestionsForDisplay = useMemo<SongSuggestion[]>(() => {
    if (songSuggestions.length > 0) return songSuggestions;
    const fallbackTitle = toDisplayTrackTitle(debouncedQuery).trim();
    if (!fallbackTitle || uniqueSongShowCount <= 0) return [];
    const lastPlayedDate = String(sortedSongShows[0]?.showDate || "");
    return [
      {
        title: fallbackTitle,
        count: uniqueSongShowCount,
        lastPlayedDate,
      },
    ];
  }, [songSuggestions, debouncedQuery, uniqueSongShowCount, sortedSongShows]);
  const songShowsForDisplay = useMemo<ShowItem[]>(() => {
    if (songShowsWithTrackTitle.length > 0) return songShowsWithTrackTitle;
    return sortedSongShows;
  }, [songShowsWithTrackTitle, sortedSongShows]);
  const showSongSuggestions =
    query.trim().length > 0;
  const showSuggestions = useMemo<ShowSuggestion[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: (ShowSuggestion & { score: number })[] = [];
    const source = searchVenueShows.length > 0 ? searchVenueShows : venueShows;
    for (const s of source) {
      const venue = toDisplayTitle(s.title || "");
      const subtitle = `${formatCardDate(s.showDate)} ${venue}`.trim();
      const hay = `${s.title || ""} ${s.venueText || ""} ${s.locationText || ""} ${s.showDate || ""}`;
      if (!queryMatchesByTokens(hay, q)) continue;
      const score = Math.max(
        relevanceScore(venue, q),
        relevanceScore(String(s.city || ""), q),
        relevanceScore(String(s.state || ""), q),
        relevanceScore(String(s.country || ""), q),
        relevanceScore(String(s.venueText || ""), q),
        relevanceScore(String(s.locationText || ""), q),
        relevanceScore(String(s.showDate || ""), q),
      );
      out.push({
        showKey: s.showKey,
        title: venue || "Unknown show",
        subtitle,
        lastPlayedDate: s.showDate || "",
        score,
      });
    }
    return out
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lastPlayedDate.localeCompare(a.lastPlayedDate);
      })
      .slice(0, 5)
      .map((item) => ({
        showKey: item.showKey,
        title: item.title,
        subtitle: item.subtitle,
        lastPlayedDate: item.lastPlayedDate,
      }));
  }, [query, searchVenueShows, venueShows]);
  const appearsInShowsSuggestions = useMemo<ShowSuggestion[]>(() => {
    const source = sortedSongShows;
    if (source.length === 0) return [];
    return source
      .slice()
      .sort((a, b) => String(b.showDate || "").localeCompare(String(a.showDate || "")))
      .slice(0, 5)
      .map((s) => {
        const venue = toDisplayTitle(s.title || "");
        return {
          showKey: s.showKey,
          title: venue || "Unknown show",
          subtitle: `${formatCardDate(s.showDate)} ${venue}`.trim(),
          lastPlayedDate: s.showDate || "",
        };
      });
  }, [sortedSongShows]);
  const showSearchSuggestionsPanel =
    showSongSuggestions;
  const mostPlayedSongShowKey = useMemo(() => {
    if (songShowsWithTrackTitle.length === 0) return "";
    let best: ShowItem | null = null;
    for (const s of songShowsWithTrackTitle) {
      if (!best || (s.plays || 0) > (best.plays || 0)) best = s;
    }
    return best?.showKey || "";
  }, [songShowsWithTrackTitle]);
  const longestSongShowKey = useMemo(() => {
    if (songShowsWithTrackTitle.length === 0) return "";
    let best: ShowItem | null = null;
    for (const s of songShowsWithTrackTitle) {
      const sec = typeof s.matchedSongSeconds === "number" ? s.matchedSongSeconds : -1;
      const bestSec =
        typeof best?.matchedSongSeconds === "number" ? best.matchedSongSeconds : -1;
      if (!best || sec > bestSec) best = s;
    }
    return best?.showKey || "";
  }, [songShowsWithTrackTitle]);

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

  useEffect(() => {
    let cancelled = false;
    const source = showOnlyShows
      ? venueShows.slice(0, 8)
      : [
          ...takingFlightShows.slice(0, 3),
          ...dripDripShows.slice(0, 3),
          ...jamSpamShows.slice(0, 2),
          ...microtonalityShows.slice(0, 2),
        ];
    const deduped: ShowItem[] = [];
    const seen = new Set<string>();
    for (const s of source) {
      if (!s?.showKey || seen.has(s.showKey)) continue;
      seen.add(s.showKey);
      if (prewarmedShowKeysRef.current.has(s.showKey)) continue;
      deduped.push(s);
    }
    deduped.forEach((s, idx) => {
      const delay = 300 + idx * 350;
      setTimeout(() => {
        if (cancelled) return;
        prewarmedShowKeysRef.current.add(s.showKey);
        void prewarmShowQueue(s);
      }, delay);
    });
    return () => {
      cancelled = true;
    };
  }, [
    showOnlyShows,
    venueShows,
    takingFlightShows,
    dripDripShows,
    jamSpamShows,
    microtonalityShows,
  ]);

  useEffect(() => {
    const el = compCarouselRef.current;
    if (!el) {
      setCanScrollCompsPrev(false);
      setCanScrollCompsNext(false);
      return;
    }
    const update = () => {
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      setCanScrollCompsPrev(el.scrollLeft > 2);
      setCanScrollCompsNext(el.scrollLeft < maxLeft - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [readyPrebuiltPlaylists.length, showPrebuiltSkeleton]);
  useEffect(() => {
    const el = takingFlightCarouselRef.current;
    if (!el) {
      setCanScrollTakingFlightPrev(false);
      setCanScrollTakingFlightNext(false);
      return;
    }
    const update = () => {
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      setCanScrollTakingFlightPrev(el.scrollLeft > 2);
      setCanScrollTakingFlightNext(el.scrollLeft < maxLeft - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [takingFlightCards.length]);
  useEffect(() => {
    const el = dripDripCarouselRef.current;
    if (!el) {
      setCanScrollDripDripPrev(false);
      setCanScrollDripDripNext(false);
      return;
    }
    const update = () => {
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      setCanScrollDripDripPrev(el.scrollLeft > 2);
      setCanScrollDripDripNext(el.scrollLeft < maxLeft - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [dripDripShows.length]);
  useEffect(() => {
    const el = jamSpamCarouselRef.current;
    if (!el) {
      setCanScrollJamSpamPrev(false);
      setCanScrollJamSpamNext(false);
      return;
    }
    const update = () => {
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      setCanScrollJamSpamPrev(el.scrollLeft > 2);
      setCanScrollJamSpamNext(el.scrollLeft < maxLeft - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [jamSpamShows.length]);

  function scrollCompsPrevPage() {
    const el = compCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: -delta, behavior: "smooth" });
  }
  function scrollCompsNextPage() {
    const el = compCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: delta, behavior: "smooth" });
  }
  function scrollTakingFlightPrevPage() {
    const el = takingFlightCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: -delta, behavior: "smooth" });
  }
  function scrollTakingFlightNextPage() {
    const el = takingFlightCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: delta, behavior: "smooth" });
  }
  function scrollDripDripPrevPage() {
    const el = dripDripCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: -delta, behavior: "smooth" });
  }
  function scrollDripDripNextPage() {
    const el = dripDripCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: delta, behavior: "smooth" });
  }
  function scrollJamSpamPrevPage() {
    const el = jamSpamCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: -delta, behavior: "smooth" });
  }
  function scrollJamSpamNextPage() {
    const el = jamSpamCarouselRef.current;
    if (!el) return;
    const delta = Math.max(320, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: delta, behavior: "smooth" });
  }

  function onCompCarouselPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = compCarouselRef.current;
    if (!el) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, select, textarea, [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }
    compDraggingRef.current = true;
    compDragStartXRef.current = e.clientX;
    compDragStartScrollLeftRef.current = el.scrollLeft;
    el.classList.add("cursor-grabbing");
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable.
    }
  }

  function onCompCarouselPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!compDraggingRef.current) return;
    const el = compCarouselRef.current;
    if (!el) return;
    const dx = e.clientX - compDragStartXRef.current;
    el.scrollLeft = compDragStartScrollLeftRef.current - dx;
  }

  function onCompCarouselPointerEnd() {
    compDraggingRef.current = false;
    const el = compCarouselRef.current;
    if (!el) return;
    el.classList.remove("cursor-grabbing");
  }
  function onTakingFlightCarouselPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = takingFlightCarouselRef.current;
    if (!el) return;
    const composedPath = typeof e.nativeEvent.composedPath === "function"
      ? e.nativeEvent.composedPath()
      : [];
    const pathHasNoDrag = composedPath.some(
      (node) => node instanceof Element && node.hasAttribute("data-no-drag"),
    );
    if (pathHasNoDrag) return;
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, select, textarea, [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }
    takingFlightDraggingRef.current = true;
    takingFlightDragStartXRef.current = e.clientX;
    takingFlightDragStartScrollLeftRef.current = el.scrollLeft;
    el.classList.add("cursor-grabbing");
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable.
    }
  }
  function onTakingFlightCarouselPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!takingFlightDraggingRef.current) return;
    const el = takingFlightCarouselRef.current;
    if (!el) return;
    const dx = e.clientX - takingFlightDragStartXRef.current;
    el.scrollLeft = takingFlightDragStartScrollLeftRef.current - dx;
  }
  function onTakingFlightCarouselPointerEnd() {
    takingFlightDraggingRef.current = false;
    const el = takingFlightCarouselRef.current;
    if (!el) return;
    el.classList.remove("cursor-grabbing");
  }
  function onDripDripCarouselPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = dripDripCarouselRef.current;
    if (!el) return;
    const composedPath = typeof e.nativeEvent.composedPath === "function"
      ? e.nativeEvent.composedPath()
      : [];
    const pathHasNoDrag = composedPath.some(
      (node) => node instanceof Element && node.hasAttribute("data-no-drag"),
    );
    if (pathHasNoDrag) return;
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, select, textarea, [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }
    dripDripDraggingRef.current = true;
    dripDripDragStartXRef.current = e.clientX;
    dripDripDragStartScrollLeftRef.current = el.scrollLeft;
    el.classList.add("cursor-grabbing");
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable.
    }
  }
  function onDripDripCarouselPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dripDripDraggingRef.current) return;
    const el = dripDripCarouselRef.current;
    if (!el) return;
    const dx = e.clientX - dripDripDragStartXRef.current;
    el.scrollLeft = dripDripDragStartScrollLeftRef.current - dx;
  }
  function onDripDripCarouselPointerEnd() {
    dripDripDraggingRef.current = false;
    const el = dripDripCarouselRef.current;
    if (!el) return;
    el.classList.remove("cursor-grabbing");
  }
  function onJamSpamCarouselPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = jamSpamCarouselRef.current;
    if (!el) return;
    const composedPath = typeof e.nativeEvent.composedPath === "function"
      ? e.nativeEvent.composedPath()
      : [];
    const pathHasNoDrag = composedPath.some(
      (node) => node instanceof Element && node.hasAttribute("data-no-drag"),
    );
    if (pathHasNoDrag) return;
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, select, textarea, [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }
    jamSpamDraggingRef.current = true;
    jamSpamDragStartXRef.current = e.clientX;
    jamSpamDragStartScrollLeftRef.current = el.scrollLeft;
    el.classList.add("cursor-grabbing");
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable.
    }
  }
  function onJamSpamCarouselPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!jamSpamDraggingRef.current) return;
    const el = jamSpamCarouselRef.current;
    if (!el) return;
    const dx = e.clientX - jamSpamDragStartXRef.current;
    el.scrollLeft = jamSpamDragStartScrollLeftRef.current - dx;
  }
  function onJamSpamCarouselPointerEnd() {
    jamSpamDraggingRef.current = false;
    const el = jamSpamCarouselRef.current;
    if (!el) return;
    el.classList.remove("cursor-grabbing");
  }

  function persistFavorites(next: string[]) {
    setFavoriteShows(next);
    localStorage.setItem(FAVORITE_SHOWS_KEY, JSON.stringify(next));
  }
  function persistHeardShows(next: string[]) {
    setHeardShows(next);
    localStorage.setItem(HEARD_SHOWS_KEY, JSON.stringify(next));
  }

  function toggleFavoriteShow(showKey: string) {
    if (favoriteSet.has(showKey)) {
      persistFavorites(favoriteShows.filter((k) => k !== showKey));
      return;
    }
    persistFavorites([showKey, ...favoriteShows].slice(0, 400));
  }
  function getOrCreateLovedSongsPlaylistId(): string {
    const existing = playlists.find(
      (p) => p.name.trim().toLowerCase() === LOVED_SONGS_PLAYLIST_NAME.toLowerCase(),
    );
    if (existing) return existing.id;
    return createPlaylist(LOVED_SONGS_PLAYLIST_NAME);
  }
  function addSongToLovedSongsPlaylist(track: SongSheetTrack) {
    if (!track.url) return;
    const id = getOrCreateLovedSongsPlaylistId();
    addTrackToPlaylist(id, {
      title: toDisplayTrackTitle(track.title),
      url: track.url,
      length: track.length,
      track: track.track,
      showKey: track.showKey,
      showDate: track.showDate,
      venueText: track.venueText,
      artwork: track.artwork,
    });
  }
  function toggleHeardShow(showKey: string) {
    if (heardSet.has(showKey)) {
      persistHeardShows(heardShows.filter((k) => k !== showKey));
      return;
    }
    persistHeardShows([showKey, ...heardShows].slice(0, 800));
  }

  function rememberRecentShow(showKey: string) {
    const next = [showKey, ...recentShows.filter((k) => k !== showKey)].slice(0, 100);
    setRecentShows(next);
    localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(next));
  }

  function buildShowHref(show: ShowItem): string {
    const base = `/show/${encodeURIComponent(show.showKey)}`;
    const id = String(show.defaultId || "").trim();
    if (!id) return base;
    return `${base}?id=${encodeURIComponent(id)}`;
  }

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
      if (queue.length > 0) {
        queueByIdentifierRef.current[identifier] = queue;
      }
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

  async function playShowFromCard(show: ShowItem) {
    const seededIdentifier = String(show.defaultId || "").trim();
    const pendingKey = seededIdentifier || `show:${show.showKey}`;
    if (playPendingRef.current.has(pendingKey)) return;
    playPendingRef.current.add(pendingKey);
    try {
      const identifier = seededIdentifier || (await resolveIdentifierForShow(show));
      if (!identifier) return;
      rememberRecentShow(show.showKey);
      const cached = queueByIdentifierRef.current[identifier];
      if (cached && cached.length > 0) {
        setQueue(cached, 0);
        logPlayedShow({ showKey: show.showKey, showTitle: toDisplayTitle(show.title) });
        return;
      }
      const queue = await ensurePlayableQueueForIdentifier(identifier, {
        showKey: show.showKey,
        showDate: show.showDate,
        venueText: toDisplayTitle(show.title),
        artwork: show.artwork,
      });
      if (queue.length === 0) return;
      setQueue(queue, 0);
      logPlayedShow({ showKey: show.showKey, showTitle: toDisplayTitle(show.title) });
    } finally {
      playPendingRef.current.delete(pendingKey);
    }
  }

  async function prewarmShowQueue(show: ShowItem): Promise<void> {
    const seededIdentifier = String(show.defaultId || "").trim();
    const identifier = seededIdentifier || (await resolveIdentifierForShow(show));
    if (!identifier) return;
    if (queueByIdentifierRef.current[identifier]?.length) return;
    await ensurePlayableQueueForIdentifier(identifier, {
      showKey: show.showKey,
      showDate: show.showDate,
      venueText: toDisplayTitle(show.title),
      artwork: show.artwork,
    });
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
        queue = await ensurePlayableQueueForIdentifier(identifier, {
          showKey: songShow.showKey,
          showDate: songShow.showDate,
          venueText: toDisplayTitle(songShow.title),
          artwork: songShow.artwork,
        });
        if (!queue || queue.length === 0) return;
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
    logPlayedSong({
      showKey: songShow.showKey,
      showTitle: toDisplayTitle(songShow.title),
      songTitle: toDisplayTrackTitle(songShow.matchedSongTitle || debouncedQuery),
    });
  }

  async function playPlaylistFromHome(playlistId: string) {
    const playlist = playlists.find((pl) => pl.id === playlistId);
    if (!playlist) return;

    const isPrebuilt =
      playlist.source === "prebuilt" ||
      playlist.prebuiltKind === "album-live-comp" ||
      PREBUILT_PLAYLIST_NAME_SET.has(playlist.name.trim().toLowerCase());

    const buildQueue = (pl: typeof playlist): Track[] =>
      pl.slots
        .map((slot) => {
          const playable = slot.variants
            .map((v) => v.track)
            .filter((t): t is Track => Boolean(String(t?.url || "").trim()));
          if (playable.length === 0) return null;
          const primaryIndex =
            isPrebuilt && playable.length > 1
              ? Math.floor(Math.random() * playable.length)
              : 0;
          const primary = playable[primaryIndex];
          const backupUrls = playable
            .filter((_, idx) => idx !== primaryIndex)
            .map((t) => String(t.url || "").trim())
            .filter(Boolean);
          const enrichedPrimary: Track = {
            ...primary,
            playlistId: pl.id,
            playlistSource: isPrebuilt ? "prebuilt" : "user",
          };
          return backupUrls.length > 0
            ? {
                ...enrichedPrimary,
                backupUrls: Array.from(new Set(backupUrls)),
              }
            : enrichedPrimary;
        })
        .filter((track): track is Track => Boolean(track?.url));

    let queue = buildQueue(playlist);
    if (isPrebuilt && queue.length === 0) {
      await syncPrebuiltPlaylistsFromServer();
      const refreshed = usePlaylists
        .getState()
        .playlists.find((pl) => pl.id === playlistId || pl.name === playlist.name);
      if (refreshed) queue = buildQueue(refreshed);
    }

    if (queue.length === 0) return;
    setQueue(queue, 0);
    logPlayedPlaylist({ playlistId, playlistName: playlist.name });
  }

  function applySongSuggestion(title: string) {
    const next = title.trim();
    if (!next) return;
    setQuery(next);
    setDebouncedQuery(next);
    router.push(`/songs/${encodeURIComponent(next)}`);
  }

  return (
    <main className="min-h-screen bg-[#080017] text-white">
      <div className="mx-auto w-full max-w-[1140px] px-4 pb-28 pt-6 md:px-6">
        <div className="space-y-10">
          {!showOnlyShows && (readyPrebuiltPlaylists.length > 0 || showPrebuiltSkeleton) ? (
            <section>
              <div className="mb-4">
                <h2 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
                  KGLW Live Compilations
                </h2>
              </div>

              <div className="relative">
                <div
                  ref={compCarouselRef}
                  className="cursor-grab overflow-x-auto pb-1 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  onPointerDown={onCompCarouselPointerDown}
                  onPointerMove={onCompCarouselPointerMove}
                  onPointerUp={onCompCarouselPointerEnd}
                  onPointerCancel={onCompCarouselPointerEnd}
                  onPointerLeave={onCompCarouselPointerEnd}
                >
                  <div className="grid w-max auto-cols-[minmax(300px,300px)] grid-flow-col grid-rows-2 gap-3 md:auto-cols-[minmax(340px,340px)]">
                    {showPrebuiltSkeleton ? renderPrebuiltSkeletonCards() : readyPrebuiltPlaylists.map((p) => {
                    const versions = p.slots.reduce((sum, slot) => sum + slot.variants.length, 0);
                    const previewThumbs = p.slots
                      .flatMap((slot) => slot.variants.map((v) => v.track))
                      .slice(0, 4)
                      .map((t) => {
                        const id = getArchiveIdentifier(t.url);
                        if (t.artwork) return t.artwork;
                        if (!id) return DEFAULT_ARTWORK_SRC;
                        return `https://archive.org/services/img/${encodeURIComponent(id)}`;
                      });
                    while (previewThumbs.length < 4) previewThumbs.push(DEFAULT_ARTWORK_SRC);
                    const chainCount = new Set(p.slots.map((s) => s.linkGroupId).filter(Boolean)).size;
                    const totalSeconds = p.slots.reduce(
                      (sum, slot) => sum + (parseLengthToSeconds(slot.variants[0]?.track.length) ?? 0),
                      0,
                    );
                    const duration = formatShowLength(totalSeconds);
                    return (
                      <div
                        key={p.id}
                        className="relative z-0 rounded-[16px] border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] p-3 backdrop-blur-[6px]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="grid w-20 shrink-0 grid-cols-2 gap-1.5">
                              {previewThumbs.map((src, idx) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={`${p.id}-home-thumb-${idx}`}
                                  src={src}
                                  alt=""
                                  className="aspect-square w-full rounded-[8px] border border-white/15 object-cover"
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                                    img.src = DEFAULT_ARTWORK_SRC;
                                  }}
                                />
                              ))}
                            </div>
                            <Link
                              href={clientHydrated ? `/playlists/${p.id}?from=home` : "/playlists"}
                              className="min-w-0 flex-1"
                            >
                              <div className="truncate text-[18px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                                {p.name}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-[6px] text-[12px] font-medium text-white/70 [font-family:var(--font-roboto-condensed)]">
                                <span>
                                  {p.slots.length} Track{p.slots.length === 1 ? "" : "s"}
                                </span>
                                <span className="size-[3px] rounded-full bg-white/60" />
                                <span>
                                  {versions} Version{versions === 1 ? "" : "s"}
                                </span>
                                <span className="size-[3px] rounded-full bg-white/60" />
                                <span>
                                  {chainCount} Chain{chainCount === 1 ? "" : "s"}
                                </span>
                                {duration ? (
                                  <>
                                    <span className="size-[3px] rounded-full bg-white/60" />
                                    <span>{duration}</span>
                                  </>
                                ) : null}
                              </div>
                            </Link>
                          </div>
                          <div className="ml-4 flex shrink-0 items-center gap-4 text-white">
                            <button
                              type="button"
                              aria-label={`Play playlist ${p.name}`}
                              className="text-[26px] text-white"
                              onClick={async () => {
                                setRequestedPlaylistId(p.id);
                                try {
                                  await playPlaylistFromHome(p.id);
                                } finally {
                                  if (!usePlayer.getState().loading) {
                                    setRequestedPlaylistId((prev) => (prev === p.id ? null : prev));
                                  }
                                }
                              }}
                            >
                              <FontAwesomeIcon
                                icon={requestedPlaylistId === p.id ? faSpinner : faCirclePlay}
                                className={requestedPlaylistId === p.id ? "animate-spin" : ""}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
                {canScrollCompsPrev ? (
                  <button
                    type="button"
                    aria-label="Previous live comps"
                    className="absolute top-1/2 left-0 hidden -translate-y-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-sm text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur md:flex"
                    onClick={scrollCompsPrevPage}
                  >
                    ‹
                  </button>
                ) : null}
              {canScrollCompsNext ? (
                <button
                  type="button"
                  aria-label="Next live comps"
                  className="absolute top-1/2 right-0 hidden -translate-y-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-sm text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur md:flex"
                  onClick={scrollCompsNextPage}
                >
                  ›
                </button>
              ) : null}
              </div>
            </section>
          ) : null}

          {!showOnlyShows ? (
            <section>
              <div className="mb-4">
                <h2 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
                  Wish I learnt how to swim
                </h2>
                <div className="mt-1 text-[13px] text-white/70 [font-family:var(--font-roboto-condensed)]">
                  Shows featuring the drippingest taps
                </div>
              </div>
              <div className="relative">
                <div
                  ref={dripDripCarouselRef}
                  className="cursor-grab overflow-x-auto pb-1 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  onPointerDown={onDripDripCarouselPointerDown}
                  onPointerMove={onDripDripCarouselPointerMove}
                  onPointerUp={onDripDripCarouselPointerEnd}
                  onPointerCancel={onDripDripCarouselPointerEnd}
                  onPointerLeave={onDripDripCarouselPointerEnd}
                >
                  <div className="grid w-max auto-cols-[minmax(300px,300px)] grid-flow-col grid-rows-1 gap-3 md:auto-cols-[minmax(340px,340px)]">
                    {showDripDripSkeleton
                      ? renderDiscoverySkeletonCards("drip-drip")
                      : dripDripShows.length === 0
                        ? [renderDiscoveryEmptyCard("drip-drip-empty", "Drip Drip shows are unavailable right now.")]
                        : dripDripShows.map((s) => {
                    const imageSrc = shouldUseDefaultArtwork(s.defaultId)
                      ? DEFAULT_ARTWORK_SRC
                      : s.artwork;
                    return (
                      <div
                        key={`drip-drip-${s.showKey}`}
                        className="relative z-0 rounded-[16px] border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] p-3 backdrop-blur-[6px]"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            data-no-drag
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={() => {
                              rememberRecentShow(s.showKey);
                              router.push(buildShowHref(s));
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageSrc}
                              alt=""
                              className="h-14 w-14 shrink-0 rounded-[8px] border border-white/15 object-cover"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                                img.src = DEFAULT_ARTWORK_SRC;
                              }}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[16px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                                {toDisplayTitle(s.title)}
                              </div>
                              <div className="mt-1 text-[12px] text-white/70 [font-family:var(--font-roboto-condensed)]">
                                {formatCardDate(s.showDate)}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            data-no-drag
                            aria-label={`Play show ${s.title}`}
                            className="ml-4 shrink-0 text-[24px] text-white"
                            onClick={() => {
                              void playShowFromCard(s);
                            }}
                          >
                            <FontAwesomeIcon icon={faCirclePlay} />
                          </button>
                        </div>
                      </div>
                    );
                        })}
                  </div>
                </div>
                {canScrollDripDripPrev ? (
                  <button
                    type="button"
                    aria-label="Previous Drip Drip shows"
                    className="absolute top-1/2 left-0 hidden -translate-y-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-sm text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur md:flex"
                    onClick={scrollDripDripPrevPage}
                  >
                    ‹
                  </button>
                ) : null}
                {canScrollDripDripNext ? (
                  <button
                    type="button"
                    aria-label="Next Drip Drip shows"
                    className="absolute top-1/2 right-0 hidden -translate-y-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-sm text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur md:flex"
                    onClick={scrollDripDripNextPage}
                  >
                    ›
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {!showOnlyShows ? (
            <section>
              <div className="mb-4">
                <h2 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
                  Jams
                </h2>
                <div className="mt-1 text-[13px] text-white/70 [font-family:var(--font-roboto-condensed)]">
                  Featured playlists with Head on/Pill, Dripping Tap, Hypertension, and more
                </div>
              </div>
              <div className="relative">
                <div
                  ref={jamSpamCarouselRef}
                  className="cursor-grab overflow-x-auto pb-1 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  onPointerDown={onJamSpamCarouselPointerDown}
                  onPointerMove={onJamSpamCarouselPointerMove}
                  onPointerUp={onJamSpamCarouselPointerEnd}
                  onPointerCancel={onJamSpamCarouselPointerEnd}
                  onPointerLeave={onJamSpamCarouselPointerEnd}
                >
                  <div className="grid w-max auto-cols-[minmax(300px,300px)] grid-flow-col grid-rows-1 gap-3 md:auto-cols-[minmax(340px,340px)]">
                    {showJamSpamSkeleton
                      ? renderDiscoverySkeletonCards("jam-spam")
                      : jamSpamShows.length === 0
                        ? [renderDiscoveryEmptyCard("jam-spam-empty", "Jams are unavailable right now.")]
                        : jamSpamShows.map((s) => {
                      const imageSrc = shouldUseDefaultArtwork(s.defaultId)
                        ? DEFAULT_ARTWORK_SRC
                        : s.artwork;
                      const jamLength = displaySongLength(s.matchedSongLength, s.matchedSongSeconds);
                      const jamTitle = toDisplayTrackTitle(s.matchedSongTitle || "");
                      return (
                        <div
                          key={`jam-spam-${s.showKey}`}
                          className="relative z-0 rounded-[16px] border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] p-3 backdrop-blur-[6px]"
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              data-no-drag
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              onClick={() => {
                                rememberRecentShow(s.showKey);
                                router.push(buildShowHref(s));
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imageSrc}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded-[8px] border border-white/15 object-cover"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                                  img.src = DEFAULT_ARTWORK_SRC;
                                }}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-[16px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                                  {toDisplayTitle(s.title)}
                                </div>
                                <div className="mt-1 text-[12px] text-white/70 [font-family:var(--font-roboto-condensed)]">
                                  {jamTitle
                                    ? `Longest ${jamTitle}${jamLength ? ` • ${jamLength}` : ""}`
                                    : formatCardDate(s.showDate)}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              data-no-drag
                              aria-label={`Play show ${s.title}`}
                              className="ml-4 shrink-0 text-[24px] text-white"
                              onClick={() => {
                                void playShowFromCard(s);
                              }}
                            >
                              <FontAwesomeIcon icon={faCirclePlay} />
                            </button>
                          </div>
                        </div>
                      );
                        })}
                  </div>
                </div>
                {canScrollJamSpamPrev ? (
                  <button
                    type="button"
                    aria-label="Previous Jam Spam shows"
                    className="absolute top-1/2 left-0 hidden -translate-y-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-sm text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur md:flex"
                    onClick={scrollJamSpamPrevPage}
                  >
                    ‹
                  </button>
                ) : null}
                {canScrollJamSpamNext ? (
                  <button
                    type="button"
                    aria-label="Next Jam Spam shows"
                    className="absolute top-1/2 right-0 hidden -translate-y-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-sm text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur md:flex"
                    onClick={scrollJamSpamNextPage}
                  >
                    ›
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {!showOnlyShows ? (
            <section>
              <div className="mb-4">
                <h2 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
                  Microtonality
                </h2>
                <div className="mt-1 text-[13px] text-white/70 [font-family:var(--font-roboto-condensed)]">
                  Shows featuring the most songs from K.G., L.W., FMB, and more
                </div>
              </div>
              <div className="cursor-grab overflow-x-auto pb-1 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid w-max auto-cols-[minmax(300px,300px)] grid-flow-col grid-rows-1 gap-3 md:auto-cols-[minmax(340px,340px)]">
                  {showMicrotonalitySkeleton
                    ? renderDiscoverySkeletonCards("microtonality")
                    : microtonalityShows.length === 0
                      ? [renderDiscoveryEmptyCard("microtonality-empty", "Microtonality shows are unavailable right now.")]
                      : microtonalityShows.map((s) => {
                    const imageSrc = shouldUseDefaultArtwork(s.defaultId)
                      ? DEFAULT_ARTWORK_SRC
                      : s.artwork;
                    return (
                      <div
                        key={`microtonality-${s.showKey}`}
                        className="relative z-0 rounded-[16px] border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] p-3 backdrop-blur-[6px]"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            data-no-drag
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={() => {
                              rememberRecentShow(s.showKey);
                              router.push(buildShowHref(s));
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageSrc}
                              alt=""
                              className="h-14 w-14 shrink-0 rounded-[8px] border border-white/15 object-cover"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src.endsWith(DEFAULT_ARTWORK_SRC)) return;
                                img.src = DEFAULT_ARTWORK_SRC;
                              }}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[16px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                                {toDisplayTitle(s.title)}
                              </div>
                              <div className="mt-1 text-[12px] text-white/70 [font-family:var(--font-roboto-condensed)]">
                                {formatCardDate(s.showDate)}
                              </div>
                              <div className="mt-0.5 text-[12px] text-white/65 [font-family:var(--font-roboto-condensed)]">
                                {s.microtonalMatchCount > 0
                                  ? `${s.microtonalMatchCount} matching songs`
                                  : "Microtonal match"}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            data-no-drag
                            aria-label={`Play show ${s.title}`}
                            className="ml-4 shrink-0 text-[24px] text-white"
                            onClick={() => {
                              void playShowFromCard(s);
                            }}
                          >
                            <FontAwesomeIcon icon={faCirclePlay} />
                          </button>
                        </div>
                      </div>
                    );
                      })}
                </div>
              </div>
            </section>
          ) : null}

          {showOnlyShows ? (
          <section>
            <div className="mb-3">
              <h1 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
                Shows
              </h1>
            </div>

            <div className="relative mb-3">
              <div className="relative">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-white"
                />
                <input
                  id="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setResultFilter("venues");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && songSuggestionsForDisplay.length > 0) {
                      e.preventDefault();
                      applySongSuggestion(songSuggestionsForDisplay[0].title);
                    }
                  }}
                  placeholder="Search songs, shows, venues, etc"
                  className="w-full rounded-xl border border-white/50 bg-transparent px-11 py-[14px] text-[14px] text-white outline-none placeholder:text-white/60"
                  autoComplete="off"
                />
              </div>
              {showSearchSuggestionsPanel && (
                <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[14px] border border-white/20 bg-[rgba(14,2,36,0.96)] shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-[10px]">
                  <div className="px-4 pb-1 pt-3 text-[11px] tracking-[0.2px] text-white/70 uppercase">Songs</div>
                  {songSuggestionsForDisplay.map((suggestion) => (
                    <button
                      key={suggestion.title.toLowerCase()}
                      type="button"
                      className="mx-1 block w-[calc(100%-8px)] rounded-[10px] px-3 py-2.5 text-left transition hover:bg-white/10"
                      onClick={() => applySongSuggestion(suggestion.title)}
                    >
                      <div className="truncate text-[14px] leading-[1.15] text-white">{suggestion.title}</div>
                      <div className="mt-0.5 text-[12px] text-white/65">
                        {suggestion.count} match{suggestion.count === 1 ? "" : "es"} • Last played:{" "}
                        {formatCardDate(suggestion.lastPlayedDate)}
                      </div>
                    </button>
                  ))}
                  {songSearchLoading && songSuggestionsForDisplay.length === 0 ? (
                    <div className="px-4 pb-3 text-[12px] text-white/60">Searching songs...</div>
                  ) : null}
                  {!songSearchLoading && songSuggestionsForDisplay.length === 0 ? (
                    <div className="px-4 pb-3 text-[12px] text-white/60">No matching songs yet.</div>
                  ) : null}
                  <div className="mt-1 px-4 pb-1 pt-2 text-[11px] tracking-[0.2px] text-white/70 uppercase">
                    Appears in these shows
                  </div>
                  {(appearsInShowsSuggestions.length > 0
                    ? appearsInShowsSuggestions
                    : showSuggestions
                  ).map((suggestion) => (
                    <button
                      key={suggestion.showKey}
                      type="button"
                      className="mx-1 block w-[calc(100%-8px)] rounded-[10px] px-3 py-2.5 text-left transition hover:bg-white/10"
                      onClick={() => {
                        rememberRecentShow(suggestion.showKey);
                        router.push(`/show/${encodeURIComponent(suggestion.showKey)}`);
                      }}
                    >
                      <div className="truncate text-[14px] leading-[1.15] text-white">{suggestion.title}</div>
                      <div className="mt-0.5 text-[12px] text-white/65">
                        Last played: {formatCardDate(suggestion.lastPlayedDate)}
                      </div>
                    </button>
                  ))}
                  {uniqueSongShowCount > 0 ? (
                    <button
                      type="button"
                      className="mx-2 mt-1 mb-2 flex w-[calc(100%-16px)] items-center justify-between rounded-[10px] border border-white/15 bg-white/5 px-3 py-2.5 text-left text-[13px] text-white transition hover:bg-white/10"
                      onClick={() => {
                        const target = toDisplayTrackTitle(query || debouncedQuery).trim();
                        if (!target) return;
                        router.push(`/songs/${encodeURIComponent(target)}`);
                      }}
                    >
                      <span>View all shows</span>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/10 px-2 py-[2px] text-[11px] text-white/85">
                          {uniqueSongShowCount}
                        </span>
                        <FontAwesomeIcon icon={faChevronRight} className="text-xs text-white" />
                      </div>
                    </button>
                  ) : null}
                  {appearsInShowsSuggestions.length === 0 && showSuggestions.length === 0 ? (
                    <div className="px-4 pb-3 text-[12px] text-white/60">
                      No matching shows yet.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Toggle advanced filters"
                  className={`rounded-full border px-3 py-2 text-[12px] transition ${
                    advancedFiltersOpen
                      ? "border-white bg-white text-[#080017]"
                      : "border-white bg-transparent text-white"
                  }`}
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
                  <span>Favorites</span>
                  <FontAwesomeIcon icon={faBookmark} />
                </button>
              </div>
              <div ref={sortMenuRef} className="relative">
                <button
                  id="sort"
                  type="button"
                  aria-label="Sort shows"
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen}
                  className="inline-flex items-center gap-2 rounded-full border border-white px-3 py-2 text-[12px] text-white"
                  onClick={() => setSortMenuOpen((v) => !v)}
                >
                  <span>{sortLabel}</span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
                {sortMenuOpen && (
                  <div className="absolute right-0 top-9 z-30 w-44 rounded-[12px] border border-white/15 bg-[#16052c] p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
                    {SORT_OPTIONS.map((opt) => {
                      const active = sort === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`flex w-full items-center rounded-[10px] px-2.5 py-2 text-left text-[14px] [font-family:var(--font-roboto-condensed)] ${
                            active ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10"
                          }`}
                          onClick={() => {
                            setSort(opt.value);
                            setSortMenuOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {advancedFiltersOpen && (
              <div className="mb-4">
                <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 md:overflow-visible">
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
                    options={availableShowTypes}
                    value={showTypes}
                    onChange={setShowTypes}
                    minWidthClass="min-w-[102px]"
                    emptyLabel="Show Type"
                  />
                  <MultiSelectDropdown
                    id="albums"
                    label=""
                    options={availableAlbums}
                    value={albums}
                    onChange={setAlbums}
                    minWidthClass="min-w-[128px]"
                    emptyLabel="Discography"
                    getOptionCount={getDiscographyOptionCount}
                    getApplyCount={getDiscographyApplyCount}
                  />
                </div>
              </div>
            )}

            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[12px] font-medium text-white">{venueTotal} shows</div>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] transition ${
                  hideHeardShows
                    ? "bg-transparent text-white"
                    : "bg-transparent text-white hover:bg-transparent"
                }`}
                onClick={() => setHideHeardShows((v) => !v)}
              >
                <span>Hide shows you&apos;ve heard</span>
                <FontAwesomeIcon
                  icon={hideHeardShows ? faToggleOn : faToggleOff}
                  className={`text-[18px] ${hideHeardShows ? "text-[#5A22C9]" : "text-white/70"}`}
                />
              </button>
            </div>

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

                <div className="mb-2 text-xs font-medium text-white">{uniqueSongShowCount} Shows</div>
                <div className="space-y-2">
                  {songShowsForDisplay.map((s) => {
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
                                artwork: s.artwork,
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
                    const isHeard = heardSet.has(s.showKey);
                    const clientStats = statsById[s.defaultId];
                    const showLengthSeconds =
                      s.showLengthSeconds ?? clientStats?.showLengthSeconds ?? null;
                    const showTrackCount =
                      s.showTrackCount ?? clientStats?.showTrackCount ?? null;
                    const isStatsLoading =
                      !Number.isFinite(showTrackCount ?? NaN) &&
                      !Number.isFinite(showLengthSeconds ?? NaN) &&
                      Boolean(String(s.defaultId || "").trim()) &&
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
                            router.push(buildShowHref(s));
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
                          <div className="inline-flex min-h-[39px] items-center justify-center gap-[10px] rounded-[8px] border border-black/20 bg-black/20 px-4 py-1">
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
                              className="inline-flex items-center gap-1 text-[14px] text-white [font-family:var(--font-roboto-condensed)]"
                              onClick={() => {
                                void playShowFromCard(s);
                              }}
                            >
                              <FontAwesomeIcon icon={faCirclePlay} className="h-4 w-4" />
                              <span>Play</span>
                            </button>
                            <span className="h-[29px] w-px bg-black/30" />
                            <button
                              type="button"
                              aria-label={isHeard ? "Mark show as not heard" : "Mark show as heard"}
                              className={`inline-flex h-[15px] w-[16px] items-center justify-center ${
                                isHeard ? "text-emerald-300" : "text-white/85"
                              }`}
                              onClick={() => toggleHeardShow(s.showKey)}
                              title={isHeard ? "Mark as not heard" : "Mark as heard"}
                            >
                              <FontAwesomeIcon
                                icon={isHeard ? faCircleCheck : faCircleCheckRegular}
                                className="h-4 w-4"
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!loading && !error && hasActiveShowFilters && venueShows.length === 0 && (
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
          ) : null}
        </div>
      </div>

      {playlistRenameTarget && (
        <>
          <button
            type="button"
            aria-label="Close rename playlist modal"
            className="fixed inset-0 z-[90] bg-black/65"
            onClick={() => setPlaylistRenameTarget(null)}
          />
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-[14px] border border-white/20 bg-[#120229] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
              <div className="text-[16px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                Rename playlist
              </div>
              <input
                autoFocus
                value={playlistRenameValue}
                onChange={(e) => setPlaylistRenameValue(e.target.value)}
                className="mt-3 w-full rounded-[10px] border border-white/25 bg-black/25 px-3 py-2 text-[14px] text-white outline-none focus:border-white/45"
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-[10px] border border-white/20 px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/10"
                  onClick={() => setPlaylistRenameTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-[10px] bg-[#5a22c9] px-3 py-1.5 text-[13px] text-white hover:bg-[#6a33d9]"
                  onClick={() => {
                    const next = playlistRenameValue.trim();
                    if (!next) return;
                    renamePlaylist(playlistRenameTarget.id, next);
                    setPlaylistRenameTarget(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {playlistDeleteTarget && (
        <>
          <button
            type="button"
            aria-label="Close delete playlist modal"
            className="fixed inset-0 z-[90] bg-black/65"
            onClick={() => setPlaylistDeleteTarget(null)}
          />
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-[14px] border border-rose-300/25 bg-[#120229] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
              <div className="text-[16px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                Delete playlist?
              </div>
              <div className="mt-2 text-[13px] text-white/75">
                This will permanently delete &quot;{playlistDeleteTarget.name}&quot;.
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-[10px] border border-white/20 px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/10"
                  onClick={() => setPlaylistDeleteTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-[10px] bg-rose-600 px-3 py-1.5 text-[13px] text-white hover:bg-rose-500"
                  onClick={() => {
                    deletePlaylist(playlistDeleteTarget.id);
                    setPlaylistDeleteTarget(null);
                  }}
                >
                  Confirm deletion
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
                      onClick={() => {
                        if (isCurrentSongLoved) return;
                        addSongToLovedSongsPlaylist(songSheetTrack);
                      }}
                    >
                      <FontAwesomeIcon
                        icon={isCurrentSongLoved ? faHeart : faHeartRegular}
                        className={isCurrentSongLoved ? "text-rose-300" : "text-white"}
                      />
                      <span>{isCurrentSongLoved ? "Loved song" : "Love song"}</span>
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
                        showKey: songSheetTrack.showKey,
                        showDate: songSheetTrack.showDate,
                        venueText: songSheetTrack.venueText,
                        artwork: songSheetTrack.artwork,
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
                  {selectablePlaylists.length > 0 ? (
                    <div className="mb-2 max-h-56 space-y-2 overflow-auto">
                      {selectablePlaylists.map((p) => {
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
                        const chainsCount = p.slots.filter((s) => s.variants.length > 1).length;
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl border border-white/10 bg-white/3 px-3 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm">{p.name}</div>
                                <div className="mt-0.5 text-[11px] text-white/50">
                                  {tracksCount} Tracks • {versionsCount} Versions • {chainsCount} Chains
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
                                      showKey: songSheetTrack.showKey,
                                      showDate: songSheetTrack.showDate,
                                      venueText: songSheetTrack.venueText,
                                      artwork: songSheetTrack.artwork,
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

export default function HomePageRoute() {
  return <HomePage />;
}
