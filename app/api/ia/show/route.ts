import { NextRequest } from "next/server";

import { type IaDoc, parseNum, scoreSource, sourceHint } from "@/lib/ia/showCore";
import { getArchiveSearchDocs } from "@/lib/archive";

// Route is inherently dynamic (reads search params); keep it cache-friendly
// via Cache-Control headers rather than force-dynamic.
export const maxDuration = 60;
const SHOW_DETAIL_CACHE_TTL_MS = 1000 * 60 * 5;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

const showDetailCache = new Map<
  string,
  {
    expiresAt: number;
    payload: {
      key: string;
      showDate: string;
      defaultId: string | null;
      sources: {
        identifier: string;
        title: string;
        hint: "SBD" | "AUD" | "MATRIX" | "UNKNOWN";
        downloads: number;
        avg_rating: number;
        num_reviews: number;
        score: number;
      }[];
    };
  }
>();

function extractShowDateFromKey(showKey: string): string | null {
  const m = showKey.match(/^(\d{4}-\d{2}-\d{2})\|/);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = sp.get("key");
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });

  const cached = showDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, { headers: SUCCESS_CACHE_HEADERS });
  }

  const showDate = extractShowDateFromKey(key);
  if (!showDate) return Response.json({ error: "Invalid key" }, { status: 400 });

  const allDocs = await getArchiveSearchDocs();
  const docs: IaDoc[] = allDocs.filter((d) => {
    const id = String(d.identifier || "");
    const title = String(d.title || "");
    return id.includes(showDate) || title.includes(showDate);
  });

  const venueSlug = (key.split("|")[1] || "").toLowerCase();

  const sources = docs
    .filter((d) => {
      const hay = `${d.identifier} ${d.title || ""}`.toLowerCase();
      return venueMatches(hay, venueSlug);
    })
    .map((d) => {
      const hint = sourceHint(d.identifier, d.title);
      const downloads = parseNum(d.downloads);
      const avg_rating = parseNum(d.avg_rating);
      const num_reviews = parseNum(d.num_reviews);
      const score = scoreSource(d);

      return {
        identifier: d.identifier,
        title: d.title || d.identifier,
        hint,
        downloads,
        avg_rating,
        num_reviews,
        score,
      };
    });

  sources.sort((a, b) => b.score - a.score);

  const defaultId = sources[0]?.identifier || null;

  const payload = {
    key,
    showDate,
    defaultId,
    sources,
  };
  showDetailCache.set(key, {
    expiresAt: Date.now() + SHOW_DETAIL_CACHE_TTL_MS,
    payload,
  });
  return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
}

function venueMatches(hay: string, venueSlug: string): boolean {
  if (!venueSlug || venueSlug === "unknown") return true;

  const tokens = venueSlug
    .toLowerCase()
    .split("-")
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);

  if (tokens.length === 0) return true;

  return tokens.some((t) => hay.includes(t));
}
