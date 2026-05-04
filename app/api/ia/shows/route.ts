import { NextRequest } from "next/server";
import { formatDuration } from "@/utils/formatDuration";
import {
  DISCOGRAPHY_ALBUM_TITLES,
  DISCOGRAPHY_ALBUMS_BY_KEY,
  DISCOGRAPHY_ALBUM_TRACK_FALLBACKS,
  type IaDoc,
  type KglwShowRow,
  type KglwShowsResponse,
  type KglwTagEntry,
  type Recording,
  type ShowListItem,
  type ShowTypeFilter,
  type SpecialTag,
  applySpecialTagsToShows,
  buildRecordingsFromDocs,
  buildShowsFromRecordings,
  filterByShowTypes,
  filterShowsByLocationAndVenue,
  matchesAnyFilter,
  normalizeFilterValue,
  parseLengthToSeconds,
  parseTrackNum,
  queryMatchesByTokens,
  showTypeLabelForShow,
  cityContextLabelForShow,
  slugify,
  sortShows,
  tokenizeSearchInput,
  toShowTypeFilter,
  trackSetRank,
  audioExtRank,
  venueSlugMatches,
  continentFromVenueCoverageTitle,
  specialTagFromShowTitle,
} from "@/lib/ia/showCore";
import {
  computeSongMatchFromFiles,
  computeShowPlaybackStatsFromFiles,
  getArchiveItem,
  getArchiveSearchDocs,
  loadArchiveDataset,
  localSongSearchDocs,
  localSongSearchDocsLoose,
} from "@/lib/archive";

// Route is inherently dynamic (reads search params); keep it cache-friendly
// via Cache-Control headers rather than force-dynamic.
export const maxDuration = 120;
const SHOWS_RESPONSE_CACHE_TTL_MS = 1000 * 60 * 10;
const ALBUM_MATCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

const KGLW_API_ROOT = "https://kglw.net/api/v2";
// KGLW data only changes when the band adds/updates a show or album, which
// happens roughly weekly. 12h is the right balance between freshness and
// upstream load; /api/revalidate can purge these tags on demand.
const KGLW_DATA_CACHE_REVALIDATE_SECONDS = 60 * 60 * 12;
export const KGLW_SHOWS_TAG = "kglw:shows";
export const KGLW_ALBUMS_TAG = "kglw:albums";
const KGLW_TAG_TITLES: Record<SpecialTag, string> = {
  ORCHESTRA: "Orchestra Show",
  RAVE: "Rave Show",
  ACOUSTIC: "Acoustic Show",
};
const KGLW_TAG_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
let kglwTagCache:
  | { expiresAt: number; byDate: Map<string, KglwTagEntry[]> }
  | null = null;


async function fetchKglwShowsForTitle(title: string): Promise<KglwShowRow[]> {
  const titlePath = encodeURIComponent(title).replace(/%20/g, "+");
  const url =
    `${KGLW_API_ROOT}/shows/showtitle/${titlePath}.json` +
    "?order_by=showdate&direction=asc&limit=2000";
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let res: Response;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 3000);
    res = await fetch(url, {
      next: {
        revalidate: KGLW_DATA_CACHE_REVALIDATE_SECONDS,
        tags: [KGLW_SHOWS_TAG, `kglw:shows:title:${title.toLowerCase()}`],
      },
      signal: controller.signal,
      headers: {
        // KGLW API can return 403 for non-browser default user agents.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
  } catch {
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: KglwShowRow[] };
  return Array.isArray(data?.data) ? data.data : [];
}

async function getKglwSpecialTagsByDate(): Promise<Map<string, KglwTagEntry[]>> {
  const now = Date.now();
  if (kglwTagCache && kglwTagCache.expiresAt > now) return kglwTagCache.byDate;

  try {
    const byDate = new Map<string, KglwTagEntry[]>();
    const requests = Object.entries(KGLW_TAG_TITLES).map(async ([tag, title]) => {
      const rows = await fetchKglwShowsForTitle(title);
      return { tag: tag as SpecialTag, rows };
    });
    const results = await Promise.all(requests);

    for (const result of results) {
      for (const row of result.rows) {
        if (Number(row.artist_id) !== 1) continue;
        const date = String(row.showdate || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

        const candidates = Array.from(
          new Set(
            [row.venuename, row.city, row.location]
              .map((s) => slugify(String(s || "")))
              .filter(Boolean),
          ),
        );
        const list = byDate.get(date) || [];
        list.push({
          tag: result.tag,
          venueCandidates: candidates,
        });
        byDate.set(date, list);
      }
    }

    kglwTagCache = {
      expiresAt: now + KGLW_TAG_CACHE_TTL_MS,
      byDate,
    };
    return byDate;
  } catch {
    return new Map<string, KglwTagEntry[]>();
  }
}

async function fetchKglwFallbackShows(): Promise<KglwShowRow[]> {
  try {
    const url =
      `${KGLW_API_ROOT}/shows.json` +
      "?artist_id=1&order_by=showdate&direction=desc&limit=4000";
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let res: Response;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 6000);
      res = await fetch(url, {
        next: {
          revalidate: KGLW_DATA_CACHE_REVALIDATE_SECONDS,
          tags: [KGLW_SHOWS_TAG],
        },
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (!res.ok) return [];
    const payload = (await res.json()) as KglwShowsResponse;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.filter((r) => Number(r.artist_id) === 1);
  } catch {
    return [];
  }
}

const showPlaybackStatsCache = new Map<
  string,
  { showLengthSeconds: number | null; showTrackCount: number | null }
>();
const albumMatchShowKeysCache = new Map<string, { expiresAt: number; showKeys: Set<string> }>();
const albumTracksCache = new Map<string, { expiresAt: number; tracks: string[] }>();
let kglwAlbumTrackMapCache:
  | { expiresAt: number; tracksByAlbumKey: Map<string, string[]> }
  | null = null;
const showsResponseCache = new Map<
  string,
  { expiresAt: number; payload: unknown }
>();
const randomPickerUniverseCache = new Map<
  string,
  { expiresAt: number; shows: ShowListItem[] }
>();
let lastGoodDefaultPayload: unknown | null = null;
const RANDOM_PICKER_UNIVERSE_CACHE_TTL_MS = 1000 * 60 * 30;

function hasUsableDefaultIds(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const items = Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  if (items.length === 0) return false;
  const withIds = items.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const id = String((item as { defaultId?: unknown }).defaultId || "").trim();
    return id.length > 0;
  }).length;
  return withIds >= Math.max(1, Math.floor(items.length * 0.5));
}

async function fetchShowPlaybackStats(
  identifier: string,
): Promise<{ showLengthSeconds: number | null; showTrackCount: number | null }> {
  const cached = showPlaybackStatsCache.get(identifier);
  if (cached) return cached;

  const item = await getArchiveItem(identifier);
  const files = item?.files;
  const out = computeShowPlaybackStatsFromFiles(files);
  if (out.showTrackCount != null || out.showLengthSeconds != null) {
    showPlaybackStatsCache.set(identifier, out);
  }
  return out;
}

async function fetchSongMatchInfo(
  identifier: string,
  queryLower: string,
): Promise<{ seconds: number | null; title: string | null; length: string | null; url: string | null }> {
  const item = await getArchiveItem(identifier);
  const files = item?.files;
  return computeSongMatchFromFiles(identifier, files, queryLower, (raw) => formatDuration(raw) ?? null);
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => run(),
  );
  await Promise.all(workers);
  return out;
}

function toApiSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAlbumKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchKglwAlbumTrackMap(): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (kglwAlbumTrackMapCache && kglwAlbumTrackMapCache.expiresAt > now) {
    return kglwAlbumTrackMapCache.tracksByAlbumKey;
  }
  try {
    const url =
      `${KGLW_API_ROOT}/albums.json` +
      "?artist_id=1&order_by=releasedate&direction=asc&limit=3000";
    const res = await fetch(url, {
      next: {
        revalidate: KGLW_DATA_CACHE_REVALIDATE_SECONDS,
        tags: [KGLW_ALBUMS_TAG],
      },
    });
    if (!res.ok) return new Map<string, string[]>();
    const payload = (await res.json()) as {
      error?: boolean;
      data?: Array<{
        album_title?: string;
        song_name?: string;
        islive?: number | string;
        artist_id?: number | string;
      }>;
    };
    if (payload?.error) return new Map<string, string[]>();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const map = new Map<string, string[]>();
    const seenByAlbum = new Map<string, Set<string>>();
    for (const row of rows) {
      if (Number(row?.artist_id ?? 0) !== 1) continue;
      if (Number(row?.islive ?? 0) !== 0) continue;
      const albumKey = normalizeAlbumKey(String(row?.album_title || ""));
      const song = String(row?.song_name || "").trim();
      if (!albumKey || !song) continue;
      const seen = seenByAlbum.get(albumKey) || new Set<string>();
      const songKey = song.toLowerCase();
      if (seen.has(songKey)) continue;
      seen.add(songKey);
      seenByAlbum.set(albumKey, seen);
      const list = map.get(albumKey) || [];
      list.push(song);
      map.set(albumKey, list);
    }
    kglwAlbumTrackMapCache = {
      expiresAt: now + ALBUM_MATCH_CACHE_TTL_MS,
      tracksByAlbumKey: map,
    };
    return map;
  } catch {
    return new Map<string, string[]>();
  }
}

async function fetchDiscographyAlbumTracks(albumTitle: string): Promise<string[]> {
  const key = String(albumTitle || "").trim().toLowerCase();
  if (!key) return [];
  const fallback = DISCOGRAPHY_ALBUM_TRACK_FALLBACKS[key];
  const cached = albumTracksCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.tracks;
  const normalized = normalizeAlbumKey(albumTitle);
  const tracksByAlbumKey = await fetchKglwAlbumTrackMap();
  const direct = tracksByAlbumKey.get(normalized);
  if (direct && direct.length > 0) {
    albumTracksCache.set(key, {
      expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
      tracks: direct,
    });
    return direct;
  }
  let bestMatch: string | null = null;
  let bestScore = -1;
  const wantedTokens = new Set(normalized.split(" ").filter((t) => t.length >= 2));
  for (const candidate of tracksByAlbumKey.keys()) {
    let overlap = 0;
    for (const token of wantedTokens) {
      if (candidate.includes(token)) overlap += 1;
    }
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = candidate;
    }
  }
  if (bestMatch && bestScore >= Math.max(2, Math.ceil(wantedTokens.size / 2))) {
    const fuzzy = tracksByAlbumKey.get(bestMatch) || [];
    if (fuzzy.length > 0) {
      albumTracksCache.set(key, {
        expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
        tracks: fuzzy,
      });
      return fuzzy;
    }
  }
  const attempts =
    key === "the silver chord"
      ? [albumTitle, "The Silver Cord"]
      : [albumTitle];
  for (const title of attempts) {
    try {
      const url =
        `${KGLW_API_ROOT}/albums/album_title/${toApiSlug(title)}.json` +
        "?artist_id=1&order_by=position&direction=asc";
      const res = await fetch(url, {
        next: {
          revalidate: KGLW_DATA_CACHE_REVALIDATE_SECONDS,
          tags: [KGLW_ALBUMS_TAG, `kglw:album:${toApiSlug(title)}`],
        },
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        error?: boolean;
        data?: Array<{ song_name?: string; islive?: number | string; position?: number | string }>;
      };
      if (payload?.error) continue;
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const ordered = rows
        .filter((r) => Number(r?.islive ?? 0) === 0)
        .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
      const out: string[] = [];
      const seen = new Set<string>();
      for (const row of ordered) {
        const song = String(row?.song_name || "").trim();
        if (!song) continue;
        const songKey = song.toLowerCase();
        if (seen.has(songKey)) continue;
        seen.add(songKey);
        out.push(song);
      }
      if (out.length > 0) {
        albumTracksCache.set(key, {
          expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
          tracks: out,
        });
        return out;
      }
    } catch {
      // try next attempt
    }
  }
  const safeFallback = Array.isArray(fallback) ? fallback : [];
  albumTracksCache.set(key, {
    expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
    tracks: safeFallback,
  });
  return safeFallback;
}

function tokensForSongTitle(title: string): string[] {
  return tokenizeSearchInput(title).slice(0, 4);
}

async function fetchAlbumMatchedShowKeys(
  albumTitle: string,
  continentFilters: string[],
): Promise<Set<string>> {
  const key = String(albumTitle || "").trim().toLowerCase();
  if (!key) return new Set<string>();
  const cached = albumMatchShowKeysCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.showKeys;

  const trackTitles = await fetchDiscographyAlbumTracks(albumTitle);
  if (trackTitles.length === 0) return new Set<string>();

  const ds = await loadArchiveDataset();
  const allDocs = ds?.docs?.length ? ds.docs : await getArchiveSearchDocs();
  const items = ds?.itemsByIdentifier || {};

  const matchingDocs: IaDoc[] = [];
  for (const d of allDocs) {
    const id = String(d.identifier || "").trim();
    const hay = (
      items[id]?.searchText ||
      [
        d.identifier,
        d.title,
        Array.isArray(d.creator) ? d.creator.join(" ") : d.creator,
        d.venue,
        d.coverage,
      ]
        .filter(Boolean)
        .join(" ")
    ).toLowerCase();

    const clauseMatch = trackTitles.some((track) => {
      const toks = tokensForSongTitle(track);
      return toks.length > 0 && toks.every((t) => hay.includes(t));
    });
    if (clauseMatch) matchingDocs.push(d);
  }

  const shows = buildShowsFromRecordings(buildRecordingsFromDocs(matchingDocs, continentFilters));
  const showKeys = new Set(shows.map((s) => s.showKey));
  albumMatchShowKeysCache.set(key, {
    expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
    showKeys,
  });
  return showKeys;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const page = Math.max(1, Number(sp.get("page") || "1"));
  const years = sp
    .getAll("year")
    .map((y) => y.trim())
    .filter(Boolean);
  const continents = sp
    .getAll("continent")
    .map((c) => c.trim())
    .filter(Boolean);
  const countries = sp
    .getAll("country")
    .map((c) => c.trim())
    .filter(Boolean);
  const cities = sp
    .getAll("city")
    .map((c) => c.trim())
    .filter(Boolean);
  const venues = sp
    .getAll("venue")
    .map((v) => v.trim())
    .filter(Boolean);
  const showTypes = sp
    .getAll("showType")
    .map((s) => toShowTypeFilter(s))
    .filter(Boolean) as ShowTypeFilter[];
  const albums = sp
    .getAll("album")
    .map((a) => a.trim())
    .filter(Boolean);
  const query = (sp.get("query") || sp.get("q") || "").trim();
  const sort = (sp.get("sort") || "newest").trim().toLowerCase();
  const randomPickMode = sp.get("random") === "1";
  const fastMode = randomPickMode ? false : sp.get("fast") === "1";
  const includeAlbumFacets = sp.get("includeAlbumFacets") === "1";
  const forceRefresh = sp.get("refresh") === "1";

  const yearFilters = years.filter((y) => /^\d{4}$/.test(y));
  const continentFilters = continents.filter((c) => c && c !== "All");
  const countryFilters = Array.from(
    new Set(countries.map((c) => normalizeFilterValue(c)).filter(Boolean)),
  ).sort();
  const cityFilters = Array.from(
    new Set(cities.map((c) => normalizeFilterValue(c)).filter(Boolean)),
  ).sort();
  const venueFilters = Array.from(
    new Set(venues.map((v) => normalizeFilterValue(v)).filter(Boolean)),
  ).sort();
  const showTypeFilters = [...showTypes].sort();
  const albumFilters = Array.from(
    new Set(
      albums
        .map((a) => a.toLowerCase())
        .filter((a) => DISCOGRAPHY_ALBUMS_BY_KEY.has(a)),
    ),
  ).sort();
  const randomUniverseKey = JSON.stringify({
    v: 1,
    mode: "random",
    years: [...yearFilters].sort(),
    continents: [...continentFilters].sort(),
    countries: countryFilters,
    cities: cityFilters,
    venues: venueFilters,
    showTypes: showTypeFilters,
    albums: albumFilters,
    query: query.toLowerCase(),
    sort,
  });
  if (randomPickMode && !forceRefresh) {
    const cachedUniverse = randomPickerUniverseCache.get(randomUniverseKey);
    if (cachedUniverse && cachedUniverse.expiresAt > Date.now() && cachedUniverse.shows.length > 0) {
      const chosen =
        cachedUniverse.shows[Math.floor(Math.random() * cachedUniverse.shows.length)];
      return Response.json(
        {
          item: chosen,
          venueTotal: cachedUniverse.shows.length,
          debug: {
            source: "random-universe-cache",
            years: yearFilters.length > 0 ? yearFilters : ["All"],
            continents: continentFilters.length > 0 ? continentFilters : ["All"],
            countries: countryFilters.length > 0 ? countryFilters : ["All"],
            cities: cityFilters.length > 0 ? cityFilters : ["All"],
            venues: venueFilters.length > 0 ? venueFilters : ["All"],
            showTypes: showTypes.length > 0 ? showTypes : ["All"],
            albums: albumFilters.length > 0 ? albumFilters : ["All"],
            query,
            sort,
          },
        },
        { headers: SUCCESS_CACHE_HEADERS },
      );
    }
  }
  const cacheKey = JSON.stringify({
    v: 2,
    page,
    years: [...yearFilters].sort(),
    continents: [...continentFilters].sort(),
    countries: countryFilters,
    cities: cityFilters,
    venues: venueFilters,
    showTypes: showTypeFilters,
    albums: albumFilters,
    query: query.toLowerCase(),
    sort,
    includeAlbumFacets,
  });
  if (!randomPickMode) {
    const cached = showsResponseCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      const payload = cached.payload;
      if (query) {
        const maybe = payload as {
          items?: unknown[];
          song?: { total?: number; items?: unknown[] };
        };
        const itemCount = Array.isArray(maybe?.items) ? maybe.items.length : 0;
        const songTotal = Number(maybe?.song?.total || 0);
        // Avoid serving sticky empty query caches from transient upstream failures.
        if (itemCount === 0 && songTotal === 0) {
          showsResponseCache.delete(cacheKey);
        } else {
          return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
        }
      } else {
      const isDefaultRootQuery =
        page === 1 &&
        !query &&
        yearFilters.length === 0 &&
        continentFilters.length === 0 &&
        countryFilters.length === 0 &&
        cityFilters.length === 0 &&
        venueFilters.length === 0 &&
        showTypes.length === 0 &&
        albumFilters.length === 0 &&
        sort === "newest";
      if (isDefaultRootQuery && !hasUsableDefaultIds(payload)) {
        showsResponseCache.delete(cacheKey);
      } else {
        return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
      }
      }
    }
  }

  const PAGE_SIZE = 25;

  let docs: IaDoc[] = await getArchiveSearchDocs();
  if (yearFilters.length > 0) {
    docs = docs.filter((d) =>
      yearFilters.some(
        (y) =>
          String(d.identifier || "").includes(y) || String(d.title || "").includes(y),
      ),
    );
  }

  const requestStartedAt = Date.now();

  if (docs.length === 0 && !query) {
    const fallbackRows = await fetchKglwFallbackShows();
    const fallbackShowsRaw: ShowListItem[] = fallbackRows
      .map((row) => {
        const showDate = String(row.showdate || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(showDate)) return null;
        const venueName = String(row.venuename || "").trim();
        const location = String(row.location || "").trim();
        const city = String(row.city || "").trim() || undefined;
        const country = location.split(",").map((v) => v.trim()).filter(Boolean).slice(-1)[0] || undefined;
        const title = venueName
          ? `King Gizzard & The Lizard Wizard Live at ${venueName} on ${showDate}`
          : `King Gizzard & The Lizard Wizard Live on ${showDate}`;
        const specialTag = specialTagFromShowTitle(String(row.showtitle || "")) || undefined;
        return {
          showKey: `${showDate}|${slugify(venueName || city || "unknown")}`,
          showDate,
          title,
          city,
          country,
          venueText: venueName || undefined,
          locationText: location || undefined,
          defaultId: "",
          sourcesCount: 0,
          artwork: "/api/default-artwork",
          continent: continentFromVenueCoverageTitle(venueName, location, title),
          plays: 0,
          specialTag,
        } as ShowListItem;
      })
      .filter(Boolean) as ShowListItem[];

    let fallbackShows = fallbackShowsRaw;
    if (yearFilters.length > 0) {
      const yearSet = new Set(yearFilters);
      fallbackShows = fallbackShows.filter((s) => yearSet.has(String(s.showDate).slice(0, 4)));
    }
    if (continentFilters.length > 0) {
      fallbackShows = fallbackShows.filter((s) => continentFilters.includes(s.continent));
    }
    fallbackShows = filterShowsByLocationAndVenue(
      fallbackShows,
      countryFilters,
      cityFilters,
      venueFilters,
    );
    fallbackShows = filterByShowTypes(fallbackShows, showTypes);
    fallbackShows = sortShows(fallbackShows, sort);

    const yearCounts = new Map<string, number>();
    const continentCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const cityContextCounts = new Map<string, Map<string, number>>();
    const venueCounts = new Map<string, number>();
    const countriesByContinentCounts = new Map<string, Map<string, number>>();
    const citiesByCountryCounts = new Map<string, Map<string, number>>();
    const showTypeCounts = new Map<string, number>([
      ["Rave", 0],
      ["Acoustic", 0],
      ["Orchestra", 0],
      ["Standard", 0],
    ]);
    for (const s of fallbackShows) {
      const y = s.showDate?.slice(0, 4);
      if (y && /^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
      const c = s.continent;
      if (c) continentCounts.set(c, (continentCounts.get(c) || 0) + 1);
      const country = String(s.country || "").trim();
      if (country) {
        countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
        const continentKey = String(s.continent || "").trim();
        if (continentKey && continentKey !== "Unknown") {
          const byContinent = countriesByContinentCounts.get(continentKey) || new Map<string, number>();
          byContinent.set(country, (byContinent.get(country) || 0) + 1);
          countriesByContinentCounts.set(continentKey, byContinent);
        }
      }
      const city = String(s.city || "").trim();
      if (city) {
        cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
        const contextLabel = cityContextLabelForShow(s);
        const byContext = cityContextCounts.get(city) || new Map<string, number>();
        byContext.set(contextLabel, (byContext.get(contextLabel) || 0) + 1);
        cityContextCounts.set(city, byContext);
        if (country) {
          const byCountry = citiesByCountryCounts.get(country) || new Map<string, number>();
          byCountry.set(city, (byCountry.get(city) || 0) + 1);
          citiesByCountryCounts.set(country, byCountry);
        }
      }
      const venue = String(s.venueText || s.title || "").trim();
      if (venue) venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
      const label = showTypeLabelForShow(s);
      showTypeCounts.set(label, (showTypeCounts.get(label) || 0) + 1);
    }

    const start = (page - 1) * PAGE_SIZE;
    const items = fallbackShows.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < fallbackShows.length;
    const payload = {
      page,
      items,
      hasMore,
      venueTotal: fallbackShows.length,
      facets: {
        years: Array.from(yearCounts.entries())
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([value, count]) => ({ value, count })),
        continents: Array.from(continentCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        countries: Array.from(countryCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        cities: Array.from(cityCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        citiesMeta: Object.fromEntries(
          Array.from(cityContextCounts.entries()).map(([city, byContext]) => {
            const top = Array.from(byContext.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
            return [city, { context: top?.[0] || "" }];
          }),
        ),
        venues: Array.from(venueCounts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        countriesByContinent: Object.fromEntries(
          Array.from(countriesByContinentCounts.entries()).map(([continent, byCountry]) => [
            continent,
            Array.from(byCountry.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([value, count]) => ({ value, count })),
          ]),
        ),
        citiesByCountry: Object.fromEntries(
          Array.from(citiesByCountryCounts.entries()).map(([country, byCity]) => [
            country,
            Array.from(byCity.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([value, count]) => ({ value, count })),
          ]),
        ),
        showTypes: Array.from(showTypeCounts.entries()).map(([value, count]) => ({ value, count })),
        albums: DISCOGRAPHY_ALBUM_TITLES.map((title) => ({ value: title, count: 0 })),
        albumShowKeys: {},
        albumUniverseCount: fallbackShows.length,
      },
      debug: {
        years: yearFilters.length > 0 ? yearFilters : ["All"],
        continents: continentFilters.length > 0 ? continentFilters : ["All"],
        countries: countryFilters.length > 0 ? countryFilters : ["All"],
        cities: cityFilters.length > 0 ? cityFilters : ["All"],
        venues: venueFilters.length > 0 ? venueFilters : ["All"],
        showTypes: showTypes.length > 0 ? showTypes : ["All"],
        albums: albumFilters.length > 0 ? albumFilters : ["All"],
        query,
        sort,
        fetchedDocs: 0,
        recordings: 0,
        uniqueShows: fallbackShows.length,
        searchedShows: fallbackShows.length,
        iaPagesUsed: 1,
        source: "kglw-fallback",
        unresolvedVenueCountryCount: fallbackShows.filter(
          (s) => !s.country && String(s.venueText || s.title || "").trim().length > 0,
        ).length,
        unresolvedVenueCountrySamples: Array.from(
          new Set(
            fallbackShows
              .filter((s) => !s.country)
              .map((s) => String(s.venueText || s.title || "").trim())
              .filter(Boolean),
          ),
        ).slice(0, 20),
      },
    };
    if (randomPickMode) {
      randomPickerUniverseCache.set(randomUniverseKey, {
        expiresAt: Date.now() + RANDOM_PICKER_UNIVERSE_CACHE_TTL_MS,
        shows: fallbackShows,
      });
      const chosen =
        fallbackShows[Math.floor(Math.random() * fallbackShows.length)] || null;
      return Response.json(
        {
          item: chosen,
          venueTotal: fallbackShows.length,
          debug: {
            years: yearFilters.length > 0 ? yearFilters : ["All"],
            continents: continentFilters.length > 0 ? continentFilters : ["All"],
            countries: countryFilters.length > 0 ? countryFilters : ["All"],
            cities: cityFilters.length > 0 ? cityFilters : ["All"],
            venues: venueFilters.length > 0 ? venueFilters : ["All"],
            showTypes: showTypes.length > 0 ? showTypes : ["All"],
            albums: albumFilters.length > 0 ? albumFilters : ["All"],
            query,
            sort,
            fetchedDocs: 0,
            recordings: 0,
            uniqueShows: fallbackShows.length,
            searchedShows: fallbackShows.length,
            iaPagesUsed: 1,
            source: "kglw-fallback-random",
            unresolvedVenueCountryCount: fallbackShows.filter(
              (s) => !s.country && String(s.venueText || s.title || "").trim().length > 0,
            ).length,
          },
        },
        { headers: SUCCESS_CACHE_HEADERS },
      );
    }
    showsResponseCache.set(cacheKey, {
      expiresAt: Date.now() + SHOWS_RESPONSE_CACHE_TTL_MS,
      payload,
    });
    if (
      page === 1 &&
      yearFilters.length === 0 &&
      continentFilters.length === 0 &&
      countryFilters.length === 0 &&
      cityFilters.length === 0 &&
      venueFilters.length === 0 &&
      showTypes.length === 0 &&
      sort === "newest"
    ) {
      lastGoodDefaultPayload = payload;
    }
    return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
  }

  const recordings = buildRecordingsFromDocs(docs, continentFilters);
  const shows = buildShowsFromRecordings(recordings);
  const kglwSpecialTagsByDate = await getKglwSpecialTagsByDate();
  const taggedShows = applySpecialTagsToShows(shows, kglwSpecialTagsByDate);
  const sortedShowsForQuery = sortShows(taggedShows.slice(), sort);

  const qLower = query.toLowerCase();
  let searchedShowsForFacets = query
    ? sortedShowsForQuery.filter((s) => {
        const normalizedShowKey = String(s.showKey || "").replaceAll("-", " ");
        const haystack = [
          s.showDate,
          s.title,
          s.continent,
          s.city,
          s.state,
          s.country,
          s.venueText,
          s.locationText,
          s.showKey,
          normalizedShowKey,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return queryMatchesByTokens(haystack, qLower);
      })
    : sortedShowsForQuery;
  const searchedShowsWithLocationFilters = filterShowsByLocationAndVenue(
    searchedShowsForFacets,
    countryFilters,
    cityFilters,
    venueFilters,
  );
  const searchedShowsWithoutAlbums = filterByShowTypes(
    searchedShowsWithLocationFilters,
    showTypes,
  );
  const showsForFacetCount = searchedShowsWithoutAlbums;
  const scopedUniverseKeys = new Set(showsForFacetCount.map((s) => s.showKey));
  const shouldComputeAlbumFacets = includeAlbumFacets || albumFilters.length > 0;
  const albumKeySets = shouldComputeAlbumFacets && DISCOGRAPHY_ALBUM_TITLES.length > 0
    ? await withConcurrency(
        DISCOGRAPHY_ALBUM_TITLES,
        3,
        async (albumTitle) => ({
          key: albumTitle.toLowerCase(),
          showKeys: await fetchAlbumMatchedShowKeys(albumTitle, continentFilters),
        }),
      )
    : [];
  const albumFacetCounts = new Map<string, number>();
  const albumFacetShowKeys: Record<string, string[]> = {};
  const albumSetMap = new Map<string, Set<string>>();
  for (const { key, showKeys } of albumKeySets) {
    albumSetMap.set(key, showKeys);
    const scoped: string[] = [];
    for (const showKey of showKeys) {
      if (!scopedUniverseKeys.has(showKey)) continue;
      scoped.push(showKey);
    }
    albumFacetShowKeys[key] = scoped;
    albumFacetCounts.set(key, scoped.length);
  }
  let searchedShows = searchedShowsWithoutAlbums;
  if (albumFilters.length > 0) {
    const selectedSets = albumFilters.map(
      (albumKey) => albumSetMap.get(albumKey) || new Set<string>(),
    );
    const intersection = new Set<string>(scopedUniverseKeys);
    for (const set of selectedSets) {
      for (const key of Array.from(intersection)) {
        if (!set.has(key)) intersection.delete(key);
      }
    }
    searchedShows = searchedShowsWithoutAlbums.filter((s) => intersection.has(s.showKey));
  }

  // Song/track matches from cached item metadata + doc fields.
  let songMatchedShows: ShowListItem[] = [];
  if (query && page === 1) {
    const songTerm = query.replace(/"/g, "").trim();

    let songDocs: IaDoc[] = [];
    if (songTerm) {
      let baseForSong = await getArchiveSearchDocs();
      if (yearFilters.length > 0) {
        baseForSong = baseForSong.filter((d) =>
          yearFilters.some(
            (y) =>
              String(d.identifier || "").includes(y) || String(d.title || "").includes(y),
          ),
        );
      }
      songDocs = await localSongSearchDocs(songTerm, baseForSong);
      if (songDocs.length === 0) {
        songDocs = await localSongSearchDocsLoose(songTerm, baseForSong);
      }
    }

    const songRecordings = buildRecordingsFromDocs(songDocs, continentFilters);
    songMatchedShows = sortShows(
      filterByShowTypes(
        filterShowsByLocationAndVenue(
          applySpecialTagsToShows(
            buildShowsFromRecordings(songRecordings),
            kglwSpecialTagsByDate,
          ),
          countryFilters,
          cityFilters,
          venueFilters,
        ),
        showTypes,
      ),
      sort,
    );

    // Compute per-show longest matching track length for sort/filter UX.
    const MAX_SONG_LENGTH_LOOKUPS = fastMode ? 0 : 12;
    const target = songMatchedShows.slice(0, MAX_SONG_LENGTH_LOOKUPS);
    if (target.length > 0) {
      const lengths = await withConcurrency(target, 8, async (s) => {
        const info = await fetchSongMatchInfo(
          s.defaultId,
          songTerm.toLowerCase(),
        );
        return { showKey: s.showKey, info };
      });
      const lengthMap = new Map(lengths.map((x) => [x.showKey, x.info]));
      songMatchedShows = songMatchedShows.map((s) => ({
        ...s,
        matchedSongSeconds: lengthMap.get(s.showKey)?.seconds ?? null,
        matchedSongTitle: lengthMap.get(s.showKey)?.title ?? null,
        matchedSongLength: lengthMap.get(s.showKey)?.length ?? null,
        matchedSongUrl: lengthMap.get(s.showKey)?.url ?? null,
      }));
    }
  }

  if (query && songMatchedShows.length > 0) {
    const mergedByKey = new Map<string, ShowListItem>();
    for (const s of searchedShows) mergedByKey.set(s.showKey, s);
    for (const s of songMatchedShows) {
      if (!mergedByKey.has(s.showKey)) mergedByKey.set(s.showKey, s);
    }
    searchedShows = sortShows(Array.from(mergedByKey.values()), sort);
    searchedShowsForFacets = searchedShows;
  }
  if (randomPickMode) {
    randomPickerUniverseCache.set(randomUniverseKey, {
      expiresAt: Date.now() + RANDOM_PICKER_UNIVERSE_CACHE_TTL_MS,
      shows: searchedShows,
    });
    const chosen = searchedShows[Math.floor(Math.random() * searchedShows.length)] || null;
    return Response.json(
      {
        item: chosen,
        venueTotal: searchedShows.length,
        debug: {
          years: yearFilters.length > 0 ? yearFilters : ["All"],
          continents: continentFilters.length > 0 ? continentFilters : ["All"],
          countries: countryFilters.length > 0 ? countryFilters : ["All"],
          cities: cityFilters.length > 0 ? cityFilters : ["All"],
          venues: venueFilters.length > 0 ? venueFilters : ["All"],
          showTypes: showTypes.length > 0 ? showTypes : ["All"],
          albums: albumFilters.length > 0 ? albumFilters : ["All"],
          query,
          sort,
          fetchedDocs: docs.length,
          recordings: recordings.length,
          uniqueShows: shows.length,
          searchedShows: searchedShows.length,
          iaPagesUsed: 1,
          source: "ia-random",
        },
      },
      { headers: SUCCESS_CACHE_HEADERS },
    );
  }

  const yearCounts = new Map<string, number>();
  const continentCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const cityContextCounts = new Map<string, Map<string, number>>();
  const venueCounts = new Map<string, number>();
  const countriesByContinentCounts = new Map<string, Map<string, number>>();
  const citiesByCountryCounts = new Map<string, Map<string, number>>();
  for (const s of searchedShows) {
    const y = s.showDate?.slice(0, 4);
    if (y && /^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
    const c = s.continent;
    if (c) continentCounts.set(c, (continentCounts.get(c) || 0) + 1);
    const country = String(s.country || "").trim();
    if (country) {
      countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
      const continentKey = String(s.continent || "").trim();
      if (continentKey && continentKey !== "Unknown") {
        const byContinent = countriesByContinentCounts.get(continentKey) || new Map<string, number>();
        byContinent.set(country, (byContinent.get(country) || 0) + 1);
        countriesByContinentCounts.set(continentKey, byContinent);
      }
    }
    const city = String(s.city || "").trim();
    if (city) {
      cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      const contextLabel = cityContextLabelForShow(s);
      const byContext = cityContextCounts.get(city) || new Map<string, number>();
      byContext.set(contextLabel, (byContext.get(contextLabel) || 0) + 1);
      cityContextCounts.set(city, byContext);
      if (country) {
        const byCountry = citiesByCountryCounts.get(country) || new Map<string, number>();
        byCountry.set(city, (byCountry.get(city) || 0) + 1);
        citiesByCountryCounts.set(country, byCountry);
      }
    }
    const venue = String(s.venueText || s.title || "").trim();
    if (venue) venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
  }
  const showTypeCounts = new Map<string, number>([
    ["Rave", 0],
    ["Acoustic", 0],
    ["Orchestra", 0],
    ["Standard", 0],
  ]);
  for (const s of searchedShowsForFacets) {
    const label = showTypeLabelForShow(s);
    showTypeCounts.set(label, (showTypeCounts.get(label) || 0) + 1);
  }

  const facets = {
    years: Array.from(yearCounts.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([value, count]) => ({ value, count })),
    continents: Array.from(continentCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    countries: Array.from(countryCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    cities: Array.from(cityCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    citiesMeta: Object.fromEntries(
      Array.from(cityContextCounts.entries()).map(([city, byContext]) => {
        const top = Array.from(byContext.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        return [city, { context: top?.[0] || "" }];
      }),
    ),
    venues: Array.from(venueCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    countriesByContinent: Object.fromEntries(
      Array.from(countriesByContinentCounts.entries()).map(([continent, byCountry]) => [
        continent,
        Array.from(byCountry.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
      ]),
    ),
    citiesByCountry: Object.fromEntries(
      Array.from(citiesByCountryCounts.entries()).map(([country, byCity]) => [
        country,
        Array.from(byCity.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
      ]),
    ),
    showTypes: Array.from(showTypeCounts.entries()).map(([value, count]) => ({ value, count })),
    albums: DISCOGRAPHY_ALBUM_TITLES.map((title) => ({
      value: title,
      count: albumFacetCounts.get(title.toLowerCase()) || 0,
    })),
    albumShowKeys: albumFacetShowKeys,
    albumUniverseCount: showsForFacetCount.length,
  };

  // App pagination
  const start = (page - 1) * PAGE_SIZE;
  let items = searchedShows.slice(start, start + PAGE_SIZE);

  const isLengthSort = sort === "show_length_longest" || sort === "show_length_shortest";
  if (isLengthSort) {
    items = items.sort((a, b) => {
      const av = typeof a.showLengthSeconds === "number" ? a.showLengthSeconds : -1;
      const bv = typeof b.showLengthSeconds === "number" ? b.showLengthSeconds : -1;
      if (sort === "show_length_shortest") return av - bv;
      return bv - av;
    });
  }
  const hasMore = start + PAGE_SIZE < searchedShows.length;
  const payload = {
    page,
    items,
    hasMore,
    venueTotal: searchedShows.length,
    song: query
      ? {
          query,
          total: songMatchedShows.length,
          items: songMatchedShows,
        }
      : undefined,
    facets,
    debug: {
      years: yearFilters.length > 0 ? yearFilters : ["All"],
      continents: continentFilters.length > 0 ? continentFilters : ["All"],
      countries: countryFilters.length > 0 ? countryFilters : ["All"],
      cities: cityFilters.length > 0 ? cityFilters : ["All"],
      venues: venueFilters.length > 0 ? venueFilters : ["All"],
      showTypes: showTypes.length > 0 ? showTypes : ["All"],
      albums: albumFilters.length > 0 ? albumFilters : ["All"],
      query,
      sort,
      fetchedDocs: docs.length,
      recordings: recordings.length,
      uniqueShows: shows.length,
      searchedShows: searchedShows.length,
      iaPagesUsed: 1,
      unresolvedVenueCountryCount: searchedShows.filter(
        (s) => !s.country && String(s.venueText || s.title || "").trim().length > 0,
      ).length,
      unresolvedVenueCountrySamples: Array.from(
        new Set(
          searchedShows
            .filter((s) => !s.country)
            .map((s) => String(s.venueText || s.title || "").trim())
            .filter(Boolean),
        ),
      ).slice(0, 20),
    },
  };
  const isDefaultRootQuery =
    page === 1 &&
    !query &&
    yearFilters.length === 0 &&
    continentFilters.length === 0 &&
    countryFilters.length === 0 &&
    cityFilters.length === 0 &&
    venueFilters.length === 0 &&
    showTypes.length === 0 &&
    albumFilters.length === 0 &&
    sort === "newest";
  if (isDefaultRootQuery && Array.isArray(payload.items) && payload.items.length > 0) {
    lastGoodDefaultPayload = payload;
  }
  if (isDefaultRootQuery && payload.items.length === 0 && lastGoodDefaultPayload) {
    return Response.json(lastGoodDefaultPayload, { headers: SUCCESS_CACHE_HEADERS });
  }
  const shouldCacheQueryPayload =
    !query ||
    payload.items.length > 0 ||
    Number(payload.song?.total || 0) > 0;
  if (shouldCacheQueryPayload) {
    showsResponseCache.set(cacheKey, {
      expiresAt: Date.now() + SHOWS_RESPONSE_CACHE_TTL_MS,
      payload,
    });
  }
  return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
}

