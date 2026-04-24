import { NextRequest } from "next/server";

import {
  getArchiveItemWithRemoteFallback,
  getShowMetadataResponsePayload,
} from "@/lib/archive";

// Route is inherently dynamic (reads search params) but we want the
// response to be CDN-cacheable via the Cache-Control header below, so we
// intentionally do NOT set dynamic = "force-dynamic".
export const maxDuration = 60;
const SHOW_METADATA_CACHE_TTL_MS = 1000 * 60 * 5;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

const showMetadataCache = new Map<
  string,
  { expiresAt: number; payload: unknown }
>();

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  const cached = showMetadataCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, { headers: SUCCESS_CACHE_HEADERS });
  }

  const item = await getArchiveItemWithRemoteFallback(id);
  const payload = getShowMetadataResponsePayload(item);
  if (!payload) {
    return Response.json({ files: [], missing: true }, { headers: SUCCESS_CACHE_HEADERS });
  }

  showMetadataCache.set(id, {
    expiresAt: Date.now() + SHOW_METADATA_CACHE_TTL_MS,
    payload,
  });
  return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
}
