import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type IaDoc = {
  identifier: string;
  title?: string;
  date?: string;
  publicdate?: string;
  addeddate?: string;

  // These fields often exist in IA advancedsearch (sometimes blank).
  downloads?: number | string;
  avg_rating?: number | string;
  num_reviews?: number | string;
};

function extractShowDate(doc: IaDoc): string | null {
  if (doc.date) {
    const m = String(doc.date).match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
  }

  const id = doc.identifier || "";
  const title = doc.title || "";

  let m = id.match(/(19|20)\d{2}[-.](0[1-9]|1[0-2])[-.](0[1-9]|[12]\d|3[01])/);
  if (m) return m[0].replace(/\./g, "-");

  m = title.match(/(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/);
  if (m) return m[0];

  return null;
}

function sourceHint(identifier: string, title?: string): "SBD" | "AUD" | "MATRIX" | "UNKNOWN" {
  const hay = `${identifier} ${title || ""}`.toLowerCase();
  if (hay.includes("matrix")) return "MATRIX";
  if (hay.includes("sbd")) return "SBD";
  if (hay.includes("aud")) return "AUD";
  return "UNKNOWN";
}

function parseNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function scoreSource(doc: IaDoc): number {
  const hint = sourceHint(doc.identifier, doc.title);

  const downloads = parseNum(doc.downloads);
  const avg = parseNum(doc.avg_rating);
  const reviews = parseNum(doc.num_reviews);

  const hintBonus = hint === "SBD" ? 3 : hint === "MATRIX" ? 1 : 0;

  // Downloads dominate; ratings nudge; hint breaks ties.
  return Math.log10(downloads + 1) * 10 + avg * 2 + Math.log10(reviews + 1) + hintBonus;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Tries to pull venue-ish text from title to reduce collisions for same-date shows.
function venueSlugFromTitle(title?: string): string {
  if (!title) return "unknown";
  const t = title;

  // Common “Live at <venue>, <city> ...”
  let m = t.match(/Live at (.+?)(?: on \d{4}-\d{2}-\d{2}|\(|$)/i);
  if (m?.[1]) return slugify(m[1]);

  // Another common pattern: "YYYY-MM-DD: ... - Live at <venue>, <city>"
  m = t.match(/- Live at (.+?)(?:\(|$)/i);
  if (m?.[1]) return slugify(m[1]);

  // fallback: first clause
  return slugify(t.split(" on ")[0] || t);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") || "1"));

  const PAGE_SIZE = 25;

  // KGLW only (back to your stable version)
  const q =
    `(collection:(KingGizzardAndTheLizardWizard)` +
    ` OR creator:("King Gizzard & The Lizard Wizard")` +
    ` OR creator:("King Gizzard And The Lizard Wizard"))` +
    ` AND mediatype:(audio)`;

  const fields = ["identifier", "title", "date", "publicdate", "addeddate", "downloads", "avg_rating", "num_reviews"];

  // Count first
  const countUrl =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(q)}` +
    fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
    `&rows=1&page=1&output=json`;

  const cRes = await fetch(countUrl, { cache: "no-store" });
  if (!cRes.ok) {
    return Response.json({ page, items: [], hasMore: false, error: "Archive request failed (count)" }, { status: 502 });
  }
  const cData: any = await cRes.json();
  const numFound = Number(cData?.response?.numFound || 0);

  const MAX_FETCH = 5000;
  const rows = Math.min(numFound || 0, MAX_FETCH);

  const url =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(q)}` +
    fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
    `&rows=${rows}&page=1&output=json`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return Response.json({ page, items: [], hasMore: false, error: "Archive request failed (docs)" }, { status: 502 });
  }

  const data: any = await res.json();
  const docs: IaDoc[] = data?.response?.docs || [];

  // Map -> recordings with computed showKey
  const recordings = docs
    .map((d) => {
      const showDate = extractShowDate(d);
      if (!showDate) return null; // if you want, we can keep unknowns later
      const venueSlug = venueSlugFromTitle(d.title);
      const showKey = `${showDate}|${venueSlug}`;

      return {
        identifier: d.identifier,
        title: d.title || d.identifier,
        showDate,
        showKey,
        artwork: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
        downloads: parseNum(d.downloads),
        avg_rating: parseNum(d.avg_rating),
        num_reviews: parseNum(d.num_reviews),
        hint: sourceHint(d.identifier, d.title),
        score: scoreSource(d),
      };
    })
    .filter(Boolean) as any[];

  // Group by showKey
  const groups = new Map<string, { showKey: string; showDate: string; title: string; sources: any[] }>();
  for (const r of recordings) {
    const g = groups.get(r.showKey);
    if (!g) {
      groups.set(r.showKey, {
        showKey: r.showKey,
        showDate: r.showDate,
        title: r.title,
        sources: [r],
      });
    } else {
      g.sources.push(r);
      // Pick a nicer title if we find one with "Live at" etc (optional heuristic)
      if (g.title.length < r.title.length) g.title = r.title;
    }
  }

  // Build show list with default source
  const shows = Array.from(groups.values())
    .map((g) => {
      const sources = g.sources.sort((a, b) => b.score - a.score);
      const best = sources[0];

      return {
        showKey: g.showKey,
        showDate: g.showDate,
        title: g.title,
        defaultId: best.identifier,
        sourcesCount: sources.length,
        // Use the default source's artwork as show artwork
        artwork: best.artwork,
      };
    })
    // newest -> oldest
    .sort((a, b) => Date.parse(b.showDate) - Date.parse(a.showDate));

  // App pagination
  const start = (page - 1) * PAGE_SIZE;
  const items = shows.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < shows.length;

  return Response.json({
    page,
    items,
    hasMore,
    debug: { numFound, fetched: docs.length, recordings: recordings.length, shows: shows.length, returned: items.length },
  });
}
