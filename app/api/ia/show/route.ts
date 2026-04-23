import { NextRequest } from "next/server";

// Route is inherently dynamic (reads search params); keep it cache-friendly
// via Cache-Control headers rather than force-dynamic.
export const maxDuration = 60;
const SHOW_DETAIL_CACHE_TTL_MS = 1000 * 60 * 5;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
};
const UPSTREAM_TIMEOUTS_MS = [7000, 10000, 14000];
// Archive.org advancedsearch results for a given identifier are stable over
// hours; cache 6h and purge via the "ia:search-docs" tag on demand.
const IA_SEARCH_REVALIDATE_SECONDS = 60 * 60 * 6;
const DEGRADED_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
};

type IaDoc = {
  identifier: string;
  title?: string;
  date?: string;
  downloads?: number | string;
  avg_rating?: number | string;
  num_reviews?: number | string;
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

function parseNum(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function extractShowDateFromKey(showKey: string): string | null {
  const m = showKey.match(/^(\d{4}-\d{2}-\d{2})\|/);
  return m ? m[1] : null;
}

function sourceHint(identifier: string, title?: string): "SBD" | "AUD" | "MATRIX" | "UNKNOWN" {
  const hay = `${identifier} ${title || ""}`.toLowerCase();
  if (hay.includes("matrix")) return "MATRIX";
  if (hay.includes("sbd")) return "SBD";
  if (hay.includes("aud")) return "AUD";
  return "UNKNOWN";
}

function scoreSource(doc: IaDoc): number {
  const hint = sourceHint(doc.identifier, doc.title);
  const downloads = parseNum(doc.downloads);
  const avg = parseNum(doc.avg_rating);
  const reviews = parseNum(doc.num_reviews);
  // Strongly prefer soundboard when available.
  const hintBonus = hint === "SBD" ? 100 : hint === "MATRIX" ? 30 : 0;
  return Math.log10(downloads + 1) * 10 + avg * 2 + Math.log10(reviews + 1) + hintBonus;
}

// Tolerant venue matching so we don't accidentally exclude valid sources,
// but we also don't include every recording from that date.
function venueMatches(hay: string, venueSlug: string): boolean {
  if (!venueSlug || venueSlug === "unknown") return true;

  // Split slug into tokens; ignore tiny tokens (too noisy)
  const tokens = venueSlug
    .toLowerCase()
    .split("-")
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);

  if (tokens.length === 0) return true;

  // Pass if ANY meaningful token matches in identifier/title
  return tokens.some((t) => hay.includes(t));
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

  // KGLW only + only items that contain the date in identifier or title
  const q =
    `(collection:(KingGizzardAndTheLizardWizard)` +
    ` OR creator:("King Gizzard & The Lizard Wizard")` +
    ` OR creator:("King Gizzard And The Lizard Wizard"))` +
    ` AND mediatype:(audio OR etree)` +
    ` AND (identifier:(*${showDate}*) OR title:(*${showDate}*))`;

  const fields = ["identifier", "title", "date", "downloads", "avg_rating", "num_reviews"];

  const url =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(q)}` +
    fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
    `&rows=500&page=1&output=json`;

  let res: Response | null = null;
  for (const timeoutMs of UPSTREAM_TIMEOUTS_MS) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), timeoutMs);
      const candidate = await fetch(url, {
        next: {
          revalidate: IA_SEARCH_REVALIDATE_SECONDS,
          tags: ["ia:search-docs"],
        },
        signal: controller.signal,
      });
      if (!candidate.ok) continue;
      res = candidate;
      break;
    } catch {
      // Retry with a longer timeout.
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  if (!res) {
    const degradedPayload = {
      key,
      showDate,
      defaultId: null,
      sources: [],
    };
    return Response.json(degradedPayload, { headers: DEGRADED_CACHE_HEADERS });
  }

  const data = (await res.json()) as { response?: { docs?: IaDoc[] } };
  const docs: IaDoc[] = Array.isArray(data?.response?.docs)
    ? data.response.docs
    : [];

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
