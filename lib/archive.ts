import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { IaDoc } from "@/lib/ia/showCore";
import {
  buildRecordingsFromDocs,
  buildShowsFromRecordings,
  queryMatchesByTokens,
  parseLengthToSeconds,
  isAudioName,
  tokenizeSearchInput,
  tokenPrefixMatch,
  type ShowListItem,
} from "@/lib/ia/showCore";

import { formatDuration } from "@/utils/formatDuration";

import type { ArchiveItemFile, ArchiveDataset, ArchiveItemPayload } from "./archiveTypes";

const DATA_PATH = join(process.cwd(), "data", "archive.json");

/** Same query as `scripts/syncArchive.ts` — used when `data/archive.json` has no docs. */
const IA_SEARCH_BASE_Q =
  `mediatype:(audio OR etree) AND (` +
  `(collection:(KingGizzardAndTheLizardWizard)` +
  ` OR creator:("King Gizzard & The Lizard Wizard")` +
  ` OR creator:("King Gizzard And The Lizard Wizard")` +
  ` OR identifier:(kglw*)` +
  ` OR title:("King Gizzard")` +
  ` OR subject:("King Gizzard"))` +
  `)`;

const IA_SEARCH_FIELDS = [
  "identifier",
  "title",
  "date",
  "publicdate",
  "addeddate",
  "creator",
  "collection",
  "coverage",
  "venue",
  "downloads",
  "avg_rating",
  "num_reviews",
] as const;

const IA_SEARCH_ROWS = 500;
const IA_SEARCH_MAX_PAGES = 120;
const IA_SEARCH_TIMEOUT_MS = 22_000;
const IA_SEARCH_SORT = "addeddate desc";
const REMOTE_DOCS_CACHE_TTL_MS = 1000 * 60 * 12;
/** If IA returns nothing (transient failure), retry soon instead of caching empties for 12h. */
const REMOTE_DOCS_EMPTY_RETRY_TTL_MS = 1000 * 90;

// Next.js Data Cache revalidation windows. In-memory caches above cover
// single-instance hot paths; these let the cache persist across cold lambdas
// and are invalidated on demand via /api/revalidate tag-based purges.
const IA_SEARCH_DATA_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6; // 6h
const IA_ITEM_DATA_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24; // 24h
export const IA_SEARCH_DOCS_TAG = "ia:search-docs";
export const IA_ITEM_TAG = "ia:item";
export function iaItemTag(identifier: string): string {
  return `ia:item:${String(identifier || "").trim()}`;
}

const IA_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

let remoteSearchDocsCache: { docs: IaDoc[]; expiresAt: number } | null = null;
let remoteSearchDocsInFlight: Promise<IaDoc[]> | null = null;

let datasetCache: ArchiveDataset | null | undefined;
let datasetMtimeMs = 0;

export async function loadArchiveDataset(): Promise<ArchiveDataset | null> {
  try {
    const buf = await readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(buf) as ArchiveDataset;
    if (!parsed || !Array.isArray(parsed.docs)) return null;
    if (!parsed.itemsByIdentifier || typeof parsed.itemsByIdentifier !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function getDatasetCached(): Promise<ArchiveDataset | null> {
  try {
    const { stat } = await import("node:fs/promises");
    const st = await stat(DATA_PATH);
    const m = Number(st.mtimeMs || 0);
    if (datasetCache && m === datasetMtimeMs) return datasetCache;
    datasetMtimeMs = m;
    datasetCache = await loadArchiveDataset();
    return datasetCache;
  } catch {
    datasetCache = null;
    return null;
  }
}

export function isArchiveDatasetLoaded(ds: ArchiveDataset | null): ds is ArchiveDataset {
  return Boolean(ds && Array.isArray(ds.docs) && ds.docs.length > 0);
}

async function fetchRemoteArchiveSearchDocsOnce(): Promise<IaDoc[]> {
  const byId = new Map<string, IaDoc>();
  for (let page = 1; page <= IA_SEARCH_MAX_PAGES; page++) {
    const url =
      "https://archive.org/advancedsearch.php" +
      `?q=${encodeURIComponent(IA_SEARCH_BASE_Q)}` +
      IA_SEARCH_FIELDS.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
      `&rows=${IA_SEARCH_ROWS}&page=${page}&output=json` +
      `&sort[]=${encodeURIComponent(IA_SEARCH_SORT)}`;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let res: Response;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), IA_SEARCH_TIMEOUT_MS);
      res = await fetch(url, {
        next: {
          revalidate: IA_SEARCH_DATA_CACHE_REVALIDATE_SECONDS,
          tags: [IA_SEARCH_DOCS_TAG],
        },
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": IA_FETCH_UA,
        },
      });
    } catch {
      break;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (!res.ok) break;
    let data: { response?: { docs?: IaDoc[] } };
    try {
      data = (await res.json()) as { response?: { docs?: IaDoc[] } };
    } catch {
      break;
    }
    const batch = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (batch.length === 0) break;
    for (const d of batch) {
      const id = String(d?.identifier || "").trim();
      if (id) byId.set(id, d);
    }
    if (batch.length < IA_SEARCH_ROWS) break;
  }
  return Array.from(byId.values());
}

async function getRemoteArchiveSearchDocsCached(): Promise<IaDoc[]> {
  const now = Date.now();
  if (remoteSearchDocsCache && remoteSearchDocsCache.expiresAt > now) {
    return remoteSearchDocsCache.docs;
  }
  if (remoteSearchDocsInFlight) return remoteSearchDocsInFlight;
  remoteSearchDocsInFlight = (async () => {
    try {
      const docs = await fetchRemoteArchiveSearchDocsOnce();
      const ttl =
        docs.length > 0 ? REMOTE_DOCS_CACHE_TTL_MS : REMOTE_DOCS_EMPTY_RETRY_TTL_MS;
      remoteSearchDocsCache = { docs, expiresAt: Date.now() + ttl };
      return docs;
    } finally {
      remoteSearchDocsInFlight = null;
    }
  })();
  return remoteSearchDocsInFlight;
}

export async function getArchiveSearchDocs(): Promise<IaDoc[]> {
  const ds = await getDatasetCached();
  if (ds?.docs?.length) return ds.docs;
  return getRemoteArchiveSearchDocsCached();
}

export async function getArchiveItem(identifier: string): Promise<ArchiveItemPayload | null> {
  const id = String(identifier || "").trim();
  if (!id) return null;
  const ds = await getDatasetCached();
  const item = ds?.itemsByIdentifier?.[id];
  return item || null;
}

/** Text used for local song search: precomputed searchText, else doc + track file names/titles. */
export function buildLocalSearchBlobForDoc(
  d: IaDoc,
  item: ArchiveItemPayload | undefined,
): string {
  if (item?.searchText) return item.searchText;
  const head = [
    d.identifier,
    d.title,
    Array.isArray(d.creator) ? d.creator.join(" ") : d.creator,
    d.venue,
    d.coverage,
  ]
    .filter(Boolean)
    .join(" ");
  if (item?.files?.length) {
    const tail = item.files
      .flatMap((f) => [f.name, f.title])
      .filter((x): x is string => Boolean(x && String(x).trim()))
      .join(" ");
    return `${head} ${tail}`.toLowerCase();
  }
  return head.toLowerCase();
}

async function fetchArchiveItemFromRemote(
  identifier: string,
): Promise<ArchiveItemPayload | null> {
  const id = String(identifier || "").trim();
  if (!id) return null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 14000);
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, {
      next: {
        revalidate: IA_ITEM_DATA_CACHE_REVALIDATE_SECONDS,
        tags: [IA_ITEM_TAG, iaItemTag(id)],
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ArchiveItemPayload;
    const files = Array.isArray(data?.files) ? data.files : [];
    const metadata = data?.metadata;
    if (files.length === 0 && !metadata) return null;
    return { metadata, files };
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * When an identifier is missing from local JSON (or has no files), fetch metadata once from Archive.org.
 * Used server-side only so discovery features keep working if the sync was partial.
 */
export async function getArchiveFilesWithRemoteFallback(
  identifier: string,
): Promise<ArchiveItemFile[] | null> {
  const id = String(identifier || "").trim();
  if (!id) return null;
  const local = await getArchiveItem(id);
  if (local?.files?.length) return local.files;

  const remote = await fetchArchiveItemFromRemote(id);
  const files = remote?.files;
  return Array.isArray(files) && files.length > 0 ? files : null;
}

/**
 * Full item payload (metadata + files) preferring local dataset and falling back
 * to a one-off Archive.org fetch when local is missing/incomplete.
 */
export async function getArchiveItemWithRemoteFallback(
  identifier: string,
): Promise<ArchiveItemPayload | null> {
  const id = String(identifier || "").trim();
  if (!id) return null;
  const local = await getArchiveItem(id);
  if (local?.files?.length) return local;

  const remote = await fetchArchiveItemFromRemote(id);
  if (remote?.files?.length || remote?.metadata) {
    return {
      metadata: remote.metadata ?? local?.metadata,
      files: remote.files ?? local?.files,
    };
  }
  return local || null;
}

/** Prefer `searchText` on each item; fallback to identifier + doc fields. */
export async function localSongSearchDocs(
  songTerm: string,
  baseDocs: IaDoc[],
): Promise<IaDoc[]> {
  const ds = await getDatasetCached();
  const term = String(songTerm || "").trim().toLowerCase();
  if (!term) return [];
  const tokens = tokenizeSearchInput(term);
  const items = ds?.itemsByIdentifier || {};

  const out: IaDoc[] = [];
  const seen = new Set<string>();
  for (const d of baseDocs) {
    const id = String(d.identifier || "").trim();
    if (!id || seen.has(id)) continue;
    const blob = buildLocalSearchBlobForDoc(d, items[id]);
    const match =
      blob.includes(term) ||
      (tokens.length > 0 && tokenPrefixMatch(blob, tokens));
    if (match) {
      seen.add(id);
      out.push(d);
    }
  }
  return out;
}

/** OR semantics on tokens (fallback when strict local match returns nothing). */
export async function localSongSearchDocsLoose(
  songTerm: string,
  baseDocs: IaDoc[],
): Promise<IaDoc[]> {
  const ds = await getDatasetCached();
  const term = String(songTerm || "").trim().toLowerCase();
  if (!term) return [];
  const tokens = tokenizeSearchInput(term);
  const items = ds?.itemsByIdentifier || {};

  const out: IaDoc[] = [];
  const seen = new Set<string>();
  for (const d of baseDocs) {
    const id = String(d.identifier || "").trim();
    if (!id || seen.has(id)) continue;
    const blob = buildLocalSearchBlobForDoc(d, items[id]);
    if (tokens.length === 0) continue;
    if (tokens.some((t) => blob.includes(t))) {
      seen.add(id);
      out.push(d);
    }
  }
  return out;
}

export function getAllShowsFromDocs(docs: IaDoc[]): ShowListItem[] {
  const recordings = buildRecordingsFromDocs(docs, []);
  return buildShowsFromRecordings(recordings);
}

export async function getAllShows(): Promise<ShowListItem[]> {
  const docs = await getArchiveSearchDocs();
  return getAllShowsFromDocs(docs);
}

export function getShowByIdFromList(shows: ShowListItem[], id: string): ShowListItem | null {
  const key = String(id || "").trim();
  if (!key) return null;
  return shows.find((s) => s.showKey === key) || null;
}

export async function getShowById(showKey: string): Promise<ShowListItem | null> {
  const shows = await getAllShows();
  return getShowByIdFromList(shows, showKey);
}

export function searchShows(shows: ShowListItem[], query: string): ShowListItem[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return shows;
  return shows.filter((s) => {
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
      String(s.showKey || "").replaceAll("-", " "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return queryMatchesByTokens(haystack, q);
  });
}

export async function getArchiveDatasetUpdatedAt(): Promise<string | null> {
  const ds = await getDatasetCached();
  return ds?.updatedAt ? String(ds.updatedAt) : null;
}

/** Metadata JSON shape for show-metadata route */
export function getShowMetadataResponsePayload(
  item: ArchiveItemPayload | null,
): { metadata?: ArchiveItemPayload["metadata"]; files?: ArchiveItemFile[] } | null {
  if (!item) return null;
  return {
    metadata: item.metadata,
    files: item.files,
  };
}

export function buildItemPayloadFromArchive(
  id: string,
  item: ArchiveItemPayload | null,
): {
  identifier: string;
  title?: string;
  creator?: string | string[];
  date?: string;
  venue?: string;
  tracks: Array<{
    name: string;
    title: string;
    track: string | undefined;
    length: string | null;
    format: string | undefined;
    source: string | undefined;
    url: string;
  }>;
} | null {
  if (!item?.files) return null;
  const PLAYABLE_FORMATS = new Set([
    "VBR MP3",
    "MP3",
    "64Kbps MP3",
    "128Kbps MP3",
    "256Kbps MP3",
  ]);
  const tracks = item.files
    .filter((f) => {
      const fmt = String(f.format || "");
      const name = String(f.name || "");
      if (!name) return false;
      if (name.endsWith(".mp3") === false) return false;
      return PLAYABLE_FORMATS.has(fmt) || fmt.includes("MP3");
    })
    .map((f) => {
      const fileName = f.name || "";
      if (!fileName || fileName.includes("..") || /[?#]/.test(fileName)) return null;
      return {
        name: fileName,
        title: f.title || fileName,
        track: f.track,
        length: formatDuration(f.length) || null,
        format: f.format,
        source: f.source,
        url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}`,
      };
    })
    .filter(Boolean) as Array<{
      name: string;
      title: string;
      track: string | undefined;
      length: string | null;
      format: string | undefined;
      source: string | undefined;
      url: string;
    }>;

  tracks.sort((a, b) => {
    const at = Number(a.track);
    const bt = Number(b.track);
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
    return String(a.name).localeCompare(String(b.name));
  });

  const md = item.metadata || {};
  return {
    identifier: id,
    title: md.title,
    creator: md.creator,
    date: md.date,
    venue: md.venue,
    tracks,
  };
}

export function computeShowPlaybackStatsFromFiles(
  files: ArchiveItemFile[] | undefined,
): { showLengthSeconds: number | null; showTrackCount: number | null } {
  if (!files?.length) return { showLengthSeconds: null, showTrackCount: null };

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
    if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel")) {
      return 12;
    }
    return 5;
  }

  function parseTrackNum(t?: string): number {
    if (!t) return Number.POSITIVE_INFINITY;
    const m = String(t).match(/^(\d+)/);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  }

  const audioAll = files.filter((f) => {
    const name = String(f?.name || "");
    return Boolean(name) && isAudioName(name);
  });
  if (audioAll.length === 0) return { showLengthSeconds: null, showTrackCount: null };

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
  let total = 0;
  for (const f of picked) {
    const title = String(f?.title || f?.name || "");
    const lenRaw = String(f?.length || "");
    const key = `${title.toLowerCase()}|${lenRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sec = parseLengthToSeconds(f?.length);
    if (sec != null) total += sec;
  }

  return {
    showLengthSeconds: total > 0 ? total : null,
    showTrackCount: seen.size > 0 ? seen.size : null,
  };
}

export function computeSongMatchFromFiles(
  identifier: string,
  files: ArchiveItemFile[] | undefined,
  queryLower: string,
  formatDurationFn: (raw: string | null | undefined) => string | null,
): {
  seconds: number | null;
  title: string | null;
  length: string | null;
  url: string | null;
} {
  if (!files?.length) {
    return { seconds: null, title: null, length: null, url: null };
  }
  const queryTokens = tokenizeSearchInput(queryLower);
  let best: { seconds: number; title: string; length: string; url: string } | null = null;
  for (const f of files) {
    const name = String(f?.name || "");
    if (!name || !isAudioName(name)) continue;
    const rawTitle = String(f?.title || f?.name || "");
    const searchable = `${rawTitle} ${name}`;
    if (
      !tokenPrefixMatch(searchable, queryTokens) &&
      !rawTitle.toLowerCase().includes(queryLower) &&
      !name.toLowerCase().includes(queryLower)
    ) {
      continue;
    }
    const sec = parseLengthToSeconds(f?.length);
    if (sec == null) continue;
    const length =
      formatDurationFn(String(f?.length || "").trim() || null) ||
      `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(name)}`;
    if (!best || sec > best.seconds) {
      best = { seconds: sec, title: rawTitle, length, url };
    }
  }
  return {
    seconds: best?.seconds ?? null,
    title: best?.title ?? null,
    length: best?.length ?? null,
    url: best?.url ?? null,
  };
}
