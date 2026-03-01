"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";

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
};

const FAVORITE_SHOWS_KEY = "kglw.favoriteShows.v1";
const RECENT_SHOWS_KEY = "kglw.recentShows.v1";

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

function summarizeSelection(values: string[]) {
  if (values.length === 0) return "All";
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
}) {
  const { id, label, options, value, onChange, minWidthClass } = props;

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

  const summary = summarizeSelection(value);
  const full = value.join(", ") || "All";

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
  const [favoriteShows, setFavoriteShows] = useState<string[]>([]);
  const [recentShows, setRecentShows] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  function buildUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", String(p));
    for (const y of years) params.append("year", y);
    for (const c of continents) params.append("continent", c);
    params.set("query", debouncedQuery);
    params.set("sort", sort);
    return `/api/ia/shows?${params.toString()}`; // IMPORTANT: use /api/ia/shows
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

  // Debounce search so we don't re-fetch on every single keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setShows([]);
    setSongShows([]);
    setSongTotal(0);
    setVenueTotal(0);
    setHasMore(true);
    setPage(1);
    loadPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|"), continents.join("|"), debouncedQuery, sort]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResultFilter("venues");
      return;
    }
    setResultFilter(songTotal > 0 ? "shows" : "venues");
  }, [debouncedQuery, songTotal]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading) return;
        if (!hasMore) return;
        if (debouncedQuery && resultFilter === "shows") return;
        loadPage(page + 1, "append");
      },
      { root: null, rootMargin: "600px", threshold: 0 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, page, debouncedQuery, resultFilter]);

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

  return (
    <main className="min-h-screen bg-linear-to-b from-[#13002e] via-[#09001f] to-[#050013] text-white">
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-4">
        <div className="pb-4 text-center text-[11px] text-white/65">SetlistAppName</div>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[34px] leading-none font-medium tracking-tight [font-family:var(--font-roboto-condensed)]">
              Playlists
            </h2>
            <Link
              href="/playlists"
              className="rounded-full border border-fuchsia-400/50 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-100"
            >
              See All ↗
            </Link>
          </div>

          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {featuredPlaylists.length === 0 ? (
              <Link
                href="/playlists"
                className="min-w-[170px] rounded-2xl border border-white/15 bg-white/5 p-3"
              >
                <div className="mb-2 h-[96px] rounded-xl bg-linear-to-br from-[#200040] to-[#4f1f9f]" />
                <div className="truncate text-sm">Create your first playlist</div>
                <div className="mt-1 text-xs text-white/60">Tap to get started</div>
              </Link>
            ) : (
              featuredPlaylists.map((p) => {
                const firstUrl = p.slots[0]?.variants[0]?.track?.url;
                const identifier = getArchiveIdentifier(firstUrl);
                const art = identifier
                  ? `https://archive.org/services/img/${encodeURIComponent(identifier)}`
                  : "";
                const versions = p.slots.reduce((sum, slot) => sum + slot.variants.length, 0);
                return (
                  <Link
                    key={p.id}
                    href={`/playlists/${p.id}`}
                    className="min-w-[170px] snap-start rounded-2xl border border-white/15 bg-white/5 p-3"
                  >
                    <div className="mb-2 h-[96px] overflow-hidden rounded-xl bg-linear-to-br from-[#200040] to-[#4f1f9f]">
                      {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={art} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl text-white/40">
                          ♪
                        </div>
                      )}
                    </div>
                    <div className="line-clamp-2 text-sm leading-tight">{p.name}</div>
                    <div className="mt-1 text-xs text-white/60">
                      {p.slots.length} Tracks • {versions} Versions
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[34px] leading-none font-medium tracking-tight [font-family:var(--font-roboto-condensed)]">
              Shows
            </h2>
            <button
              type="button"
              aria-label="Toggle search"
              className="rounded-full p-2 text-white/85"
              onClick={() => setSearchOpen((v) => !v)}
            >
              ⌕
            </button>
          </div>

          {searchOpen && (
            <div className="mb-3">
              <input
                id="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, venues, dates..."
                className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none focus:border-fuchsia-300/45"
                autoComplete="off"
              />
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowTab("all")}
              className={`rounded-full px-3 py-1.5 text-xs ${
                showTab === "all"
                  ? "bg-fuchsia-500/45 text-white"
                  : "bg-white/10 text-white/80"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setShowTab("recent")}
              className={`rounded-full px-3 py-1.5 text-xs ${
                showTab === "recent"
                  ? "bg-fuchsia-500/45 text-white"
                  : "bg-white/10 text-white/80"
              }`}
            >
              Recently Played
            </button>
            <button
              type="button"
              onClick={() => setShowTab("favorites")}
              className={`rounded-full px-3 py-1.5 text-xs ${
                showTab === "favorites"
                  ? "bg-fuchsia-500/45 text-white"
                  : "bg-white/10 text-white/80"
              }`}
            >
              Favorites
            </button>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-[11px] text-white/60">Sort By</div>
              <select
                id="sort"
                className="w-full rounded-full border border-white/20 bg-black/35 px-3 py-2 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="newest">Recent</option>
                <option value="oldest">Oldest</option>
                <option value="most_played">Most played</option>
                <option value="least_played">Least played</option>
                <option value="show_length_longest">Longest show</option>
                <option value="show_length_shortest">Shortest show</option>
              </select>
            </div>
            <MultiSelectDropdown
              id="years"
              label="Filters"
              options={availableYears}
              value={years}
              onChange={setYears}
            />
            <MultiSelectDropdown
              id="continents"
              label=" "
              options={availableContinents}
              value={continents}
              onChange={setContinents}
            />
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-red-400/30 bg-red-600/15 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {venueShows.map((s) => {
              const isFav = favoriteSet.has(s.showKey);
              const detailsText = `${s.sourcesCount} Tracks${s.showLengthSeconds ? ` • ${formatShowLength(s.showLengthSeconds)}` : ""}`;
              return (
                <div
                  key={s.showKey}
                  className="group relative rounded-2xl border border-white/20 bg-white/8 p-2.5"
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => {
                      rememberRecentShow(s.showKey);
                      router.push(`/show/${encodeURIComponent(s.showKey)}`);
                    }}
                  >
                    <div className="h-[74px] w-[74px] shrink-0 overflow-hidden rounded-lg bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.artwork} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-white/75">{detailsText}</div>
                      <div className="mt-0.5 line-clamp-2 text-[25px] leading-[1.02] [font-family:var(--font-roboto-condensed)]">
                        {toDisplayTitle(s.title)}
                      </div>
                      <div className="mt-1 text-xs text-white/80">{s.showDate}</div>
                      <div className="mt-1 truncate text-xs text-white/65">
                        {labelFromShowKey(s.showKey)}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={isFav ? "Remove favorite show" : "Favorite show"}
                    className={`absolute right-3 top-3 text-sm ${
                      isFav ? "text-fuchsia-400" : "text-white/50"
                    }`}
                    onClick={() => toggleFavoriteShow(s.showKey)}
                    title={isFav ? "Unfavorite show" : "Favorite show"}
                  >
                    ♥
                  </button>
                </div>
              );
            })}

            {venueShows.length === 0 && (
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
                No shows found for this filter.
              </div>
            )}
          </div>

          <div className="py-8">
            {loading && <div className="text-sm text-white/65">Loading…</div>}
            {!hasMore && !loading && (
              <div className="text-sm text-white/50">End of list.</div>
            )}
            <div ref={sentinelRef} />
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#080015]/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4 px-4 py-3 text-center text-[10px] text-white/80">
          <Link href="/" className="text-fuchsia-300">
            HOME
          </Link>
          <Link href="/playlists">LIBRARY</Link>
          <Link href="/">BROWSE</Link>
          <Link href="/">PROFILE</Link>
        </div>
      </nav>
    </main>
  );
}
