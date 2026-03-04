import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SHOW_METADATA_CACHE_TTL_MS = 1000 * 60 * 5;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
};

type IaMetadataFile = {
  name?: string;
  format?: string;
  title?: string;
  track?: string;
  length?: string;
};

type IaMetadataResponse = {
  metadata?: {
    title?: string;
    venue?: string;
    coverage?: string;
    description?: string;
  };
  files?: IaMetadataFile[];
};

const showMetadataCache = new Map<
  string,
  { expiresAt: number; payload: IaMetadataResponse }
>();

async function fetchArchiveMetadata(id: string, timeoutMs: number): Promise<IaMetadataResponse | null> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as IaMetadataResponse;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  const cached = showMetadataCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, { headers: SUCCESS_CACHE_HEADERS });
  }

  const payload =
    (await fetchArchiveMetadata(id, 4500)) ||
    (await fetchArchiveMetadata(id, 8000));
  if (!payload) {
    return Response.json({ error: "Archive metadata failed" }, { status: 502 });
  }
  showMetadataCache.set(id, {
    expiresAt: Date.now() + SHOW_METADATA_CACHE_TTL_MS,
    payload,
  });
  return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
}
