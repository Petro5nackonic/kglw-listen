"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/components/player/store";
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
};

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">kglw-listen</h1>
          <p className="text-white/70">
            Browse King Gizzard live shows from Archive.org
          </p>
        </div>

        <Link
          href="/playlists"
          className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:border-white/25 hover:text-white transition"
        >
          Playlists
        </Link>
      </header>

      <section className="mb-6 space-y-4">
        <div>
          <label className="mb-2 block text-sm text-white/70" htmlFor="search">
            Search
          </label>
          <input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, venues, dates, continents…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/30"
            autoComplete="off"
          />
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <MultiSelectDropdown
            id="years"
            label="Year"
            options={availableYears}
            value={years}
            onChange={setYears}
            minWidthClass="min-w-[12rem]"
          />

          <MultiSelectDropdown
            id="continents"
            label="Continent"
            options={availableContinents}
            value={continents}
            onChange={setContinents}
            minWidthClass="min-w-[14rem]"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <label htmlFor="sort" className="text-sm text-white/70">
            Sort by
          </label>
          <select
            id="sort"
            className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_played">Most played</option>
            <option value="least_played">Least played</option>
            <option value="show_length_longest">Show length - longest</option>
            <option value="show_length_shortest">Show length - shortest</option>
          </select>
        </div>
      </div>

      {debouncedQuery && (
        <section className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-medium text-white/90">Search results</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setResultFilter("venues")}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                resultFilter === "venues"
                  ? "border-white/35 bg-white/15 text-white"
                  : "border-white/15 bg-black/20 text-white/75 hover:border-white/25 hover:text-white"
              }`}
            >
              Venues {venueTotal}
            </button>
            <button
              type="button"
              onClick={() => setResultFilter("shows")}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                resultFilter === "shows"
                  ? "border-white/35 bg-white/15 text-white"
                  : "border-white/15 bg-black/20 text-white/75 hover:border-white/25 hover:text-white"
              }`}
            >
              Shows {songTotal}
            </button>

            {resultFilter === "shows" && (
              <button
                type="button"
                onClick={() =>
                  setSongLengthSort((v) => (v === "desc" ? "asc" : "desc"))
                }
                className="ml-auto rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-white/80 hover:border-white/25 hover:text-white transition"
              >
                {songLengthSort === "desc"
                  ? "Longest version first"
                  : "Shortest version first"}
              </button>
            )}
          </div>
        </section>
      )}

      {debouncedQuery && resultFilter === "shows" && (
        <>
          <div className="mb-2 text-sm font-medium text-white/85">
            {debouncedQuery} appears in {songTotal} show
            {songTotal === 1 ? "" : "s"}
          </div>
          <section className="mb-5 rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden">
            {sortedSongShows.map((s) => (
              <div
                key={`song-${s.showKey}`}
                className="group relative flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 transition cursor-pointer"
                onClick={() => {
                  router.push(`/show/${encodeURIComponent(s.showKey)}`);
                }}
              >
                <div className="h-10 w-10 overflow-hidden rounded bg-black/20 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.artwork}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1 pr-16">
                  <div className="truncate text-sm font-medium">
                    {toDisplayTrackTitle(s.matchedSongTitle || debouncedQuery)}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-white/60">
                    {toDisplayTitle(s.title)} • {s.showDate}
                  </div>
                </div>

                <div className="shrink-0 text-xs text-white/70">
                  {displaySongLength(s.matchedSongLength, s.matchedSongSeconds)}
                </div>

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    className="rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-xs text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!s.matchedSongUrl) return;
                      setQueue(
                        [
                          {
                            title: toDisplayTrackTitle(
                              s.matchedSongTitle || debouncedQuery,
                            ),
                            url: s.matchedSongUrl,
                            length: displaySongLength(
                              s.matchedSongLength,
                              s.matchedSongSeconds,
                            ),
                          },
                        ],
                        0,
                      );
                    }}
                    disabled={!s.matchedSongUrl}
                    title={s.matchedSongUrl ? "Play song" : "Song preview unavailable"}
                  >
                    Play
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-xs text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      const song = toDisplayTrackTitle(
                        s.matchedSongTitle || debouncedQuery || "",
                      ).trim();
                      const params = new URLSearchParams();
                      if (song) params.set("song", song);
                      const suffix = params.toString() ? `?${params.toString()}` : "";
                      router.push(`/show/${encodeURIComponent(s.showKey)}${suffix}`);
                    }}
                    title="Go to show and focus this song"
                  >
                    Go to show
                  </button>
                </div>
              </div>
            ))}
            {sortedSongShows.length === 0 && (
              <div className="px-3 py-4 text-sm text-white/65">
                No song matches found.
              </div>
            )}
          </section>
        </>
      )}

      {debouncedQuery && resultFilter === "venues" && (
        <div className="mb-2 text-sm font-medium text-white/85">Venues</div>
      )}

      {(!debouncedQuery || resultFilter === "venues") && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shows.map((s) => (
          <Link
            key={s.showKey}
            href={`/show/${encodeURIComponent(s.showKey)}`} // IMPORTANT: must be /show/<key>
            className="group rounded-xl border border-white/10 bg-white/5 p-3 hover:border-white/20 hover:bg-white/10 transition"
          >
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-lg bg-black/20 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.artwork}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="min-w-0">
                <div className="text-sm text-white/70">{s.showDate}</div>
                <div className="mt-0.5 line-clamp-2 font-medium">
                  {toDisplayTitle(s.title)}
                </div>
                <div className="mt-1 text-xs text-white/60 flex flex-wrap gap-x-2 gap-y-1">
                  {s.continent && s.continent !== "Unknown" && (
                    <span>{s.continent}</span>
                  )}
                  <span>•</span>
                  <span>
                    {s.sourcesCount} source{s.sourcesCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
        </section>
      )}

      <div className="py-8">
        {loading && <div className="text-sm text-white/60">Loading…</div>}
        {!hasMore && !loading && (
          <div className="text-sm text-white/60">End of list.</div>
        )}
        <div ref={sentinelRef} />
      </div>
    </main>
  );
}
