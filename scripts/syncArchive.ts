/**
 * Fetches King Gizzard audio items from Archive.org advanced search + per-item metadata,
 * then writes `data/archive.json` for the app data layer.
 *
 * Run: npx tsx scripts/syncArchive.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ArchiveDataset, ArchiveItemPayload } from "../lib/archiveTypes";
import type { IaDoc } from "../lib/ia/showCore";

const DATA_DIR = join(process.cwd(), "data");
const OUT_FILE = join(DATA_DIR, "archive.json");

const BASE_Q =
  `mediatype:(audio OR etree) AND (` +
  `(collection:(KingGizzardAndTheLizardWizard)` +
  ` OR creator:("King Gizzard & The Lizard Wizard")` +
  ` OR creator:("King Gizzard And The Lizard Wizard")` +
  ` OR identifier:(kglw*)` +
  ` OR title:("King Gizzard")` +
  ` OR subject:("King Gizzard"))` +
  `)`;

const FIELDS = [
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
];

const IA_ROWS = 500;
const MAX_PAGES = 400;
const METADATA_CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 25000;

function log(msg: string) {
  console.log(`[sync-archive] ${msg}`);
}

function logErr(msg: string, err?: unknown) {
  console.error(`[sync-archive] ${msg}`, err ?? "");
}

async function fetchJson<T>(url: string): Promise<T | null> {
  let to: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    to = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    logErr(`fetch failed: ${url}`, e);
    return null;
  } finally {
    if (to) clearTimeout(to);
  }
}

async function fetchAllSearchDocs(): Promise<IaDoc[]> {
  const SORT = "addeddate desc";
  const byId = new Map<string, IaDoc>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      "https://archive.org/advancedsearch.php" +
      `?q=${encodeURIComponent(BASE_Q)}` +
      FIELDS.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
      `&rows=${IA_ROWS}&page=${page}&output=json` +
      `&sort[]=${encodeURIComponent(SORT)}`;

    const data = await fetchJson<{ response?: { docs?: IaDoc[] } }>(url);
    const batch = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    log(`search page ${page}: ${batch.length} docs`);
    if (batch.length === 0) break;
    for (const d of batch) {
      const id = String(d?.identifier || "").trim();
      if (id) byId.set(id, d);
    }
    if (batch.length < IA_ROWS) break;
  }

  return Array.from(byId.values());
}

function buildSearchText(
  identifier: string,
  meta: ArchiveItemPayload["metadata"],
  files: ArchiveItemPayload["files"],
): string {
  const parts: string[] = [
    identifier,
    meta?.title,
    meta?.venue,
    meta?.coverage,
    meta?.description,
    Array.isArray(meta?.creator) ? meta.creator.join(" ") : meta?.creator,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
  for (const f of files || []) {
    if (f?.name) parts.push(String(f.name));
    if (f?.title) parts.push(String(f.title));
  }
  return parts.join(" ").toLowerCase();
}

async function fetchItemMetadata(identifier: string): Promise<ArchiveItemPayload | null> {
  const url = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
  const raw = await fetchJson<{
    metadata?: ArchiveItemPayload["metadata"];
    files?: ArchiveItemPayload["files"];
  }>(url);
  if (!raw) return null;
  const files = Array.isArray(raw.files) ? raw.files : [];
  const meta = raw.metadata || {};
  const searchText = buildSearchText(identifier, meta, files);
  return { metadata: meta, files, searchText };
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

async function main() {
  log("starting (this may take several minutes)…");
  const docs = await fetchAllSearchDocs();
  log(`unique search docs: ${docs.length}`);

  const ids = docs.map((d) => String(d.identifier || "").trim()).filter(Boolean);
  const itemsByIdentifier: Record<string, ArchiveItemPayload> = {};

  let ok = 0;
  let failed = 0;
  await withConcurrency(ids, METADATA_CONCURRENCY, async (id) => {
    const item = await fetchItemMetadata(id);
    if (item) {
      ok++;
      itemsByIdentifier[id] = item;
    } else {
      failed++;
      logErr(`metadata failed for ${id}`);
    }
    return null;
  });

  const payload: ArchiveDataset = {
    version: 1,
    updatedAt: new Date().toISOString(),
    docs,
    itemsByIdentifier,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload), "utf8");
  log(`wrote ${OUT_FILE} (${docs.length} docs, ${ok} metadata ok, ${failed} failed)`);
}

main().catch((e) => {
  logErr("fatal", e);
  process.exit(1);
});
