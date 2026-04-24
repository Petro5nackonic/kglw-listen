import { NextRequest } from "next/server";

import {
  buildItemPayloadFromArchive,
  getArchiveItemWithRemoteFallback,
} from "@/lib/archive";

const ITEM_CACHE_TTL_MS = 1000 * 60 * 10;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};
const itemCache = new Map<string, { expiresAt: number; payload: unknown }>();

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const cached = itemCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, { headers: SUCCESS_CACHE_HEADERS });
  }

  const item = await getArchiveItemWithRemoteFallback(id);
  const payload = buildItemPayloadFromArchive(id, item);
  if (!payload) {
    return Response.json(
      { identifier: id, tracks: [], missing: true },
      { headers: SUCCESS_CACHE_HEADERS },
    );
  }

  itemCache.set(id, { expiresAt: Date.now() + ITEM_CACHE_TTL_MS, payload });
  return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
}
