import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SHOW_METADATA_CACHE_TTL_MS = 1000 * 60 * 5;

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

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  const cached = showMetadataCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload);
  }

  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return Response.json({ error: `Archive metadata failed: ${res.status}` }, { status: 502 });
  }

  const payload = (await res.json()) as IaMetadataResponse;
  showMetadataCache.set(id, {
    expiresAt: Date.now() + SHOW_METADATA_CACHE_TTL_MS,
    payload,
  });
  return Response.json(payload);
}
