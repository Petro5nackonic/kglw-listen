import { NextRequest } from "next/server";
import { formatDuration } from "@/utils/formatDuration";

const PLAYABLE_FORMATS = new Set([
  "VBR MP3",
  "MP3",
  "64Kbps MP3",
  "128Kbps MP3",
  "256Kbps MP3",
]);

type MetaFile = {
  name?: string;
  format?: string;
  title?: string;
  track?: string;
  length?: string | number;
  source?: string;
};

type MetaResponse = {
  metadata?: {
    title?: string;
    creator?: string | string[];
    date?: string;
    venue?: string;
  };
  files?: MetaFile[];
};

const ITEM_CACHE_TTL_MS = 1000 * 60 * 10;
const itemCache = new Map<string, { expiresAt: number; payload: unknown }>();

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const cached = itemCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload);
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let metaRes: Response;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 8000);
    metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return Response.json({ error: "Metadata fetch timed out" }, { status: 504 });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!metaRes.ok) return Response.json({ error: "Metadata fetch failed" }, { status: 502 });

  const meta = (await metaRes.json()) as MetaResponse;
  const files = Array.isArray(meta?.files) ? meta.files : [];
  const md = meta?.metadata || {};

  const tracks = files
    .filter((f) => {
      const fmt = String(f.format || "");
      const name = String(f.name || "");
      if (!name) return false;
      if (name.endsWith(".mp3") === false) return false;
      return PLAYABLE_FORMATS.has(fmt) || fmt.includes("MP3");
    })
    .map((f) => {
      const fileName = f.name || "";
      return {
        name: fileName,
        title: f.title || fileName,
        track: f.track,
        length: formatDuration(f.length),
        format: f.format,
        source: f.source,
        url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}`,
      };
    });

  // Keep deterministic order
  tracks.sort((a, b) => {
    const at = Number(a.track);
    const bt = Number(b.track);
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
    return String(a.name).localeCompare(String(b.name));
  });

  const payload = {
    identifier: id,
    title: md.title,
    creator: md.creator,
    date: md.date,
    venue: md.venue,
    tracks,
  };
  itemCache.set(id, { expiresAt: Date.now() + ITEM_CACHE_TTL_MS, payload });
  return Response.json(payload);
}
