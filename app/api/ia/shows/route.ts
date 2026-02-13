import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Doc = { identifier: string; title?: string; date?: string };

function extractDate(doc: Doc): string | null {
  const idMatch = doc.identifier?.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
  if (idMatch) return idMatch[0];

  const title = doc.title || "";
  const titleMatch = title.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
  if (titleMatch) return titleMatch[0];

  const d = doc.date || "";
  const dateMatch = d.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
  if (dateMatch) return dateMatch[0];

  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const appPage = Math.max(1, Number(sp.get("page") || "1"));

  const APP_PAGE_SIZE = 25;

  // If this grows later, we’ll add caching/indexing,
  // but for now numFound is small (you saw 140).
  const MAX_FETCH = 2000;

  const q = `identifier:(kglw*) AND mediatype:(audio)`;

  const url =
    `https://archive.org/advancedsearch.php` +
    `?q=${encodeURIComponent(q)}` +
    `&fl[]=identifier&fl[]=title&fl[]=date` +
    `&sort[]=${encodeURIComponent("identifier desc")}` + // any sort, we'll re-sort ourselves
    `&rows=${MAX_FETCH}` +
    `&page=1` +
    `&output=json`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return Response.json(
      { page: appPage, items: [], hasMore: false, error: "Archive request failed" },
      { status: 502 }
    );
  }

  const data: any = await res.json();
  const docs = (data?.response?.docs || []) as Doc[];
  const numFound = Number(data?.response?.numFound || 0);

  // Build list with showDate
  let all = docs.map((d) => ({
    identifier: d.identifier,
    title: d.title,
    date: d.date,
    showDate: extractDate(d),
  }));

  // Keep only items with a showDate (recommended)
  all = all.filter((x) => x.showDate);

  // Dedupe by identifier (just in case)
  const seen = new Set<string>();
  all = all.filter((x) => {
    if (seen.has(x.identifier)) return false;
    seen.add(x.identifier);
    return true;
  });

  // Sort newest -> oldest by computed showDate
  all.sort((a, b) => Date.parse(b.showDate!) - Date.parse(a.showDate!));

  // App paging slice
  const start = (appPage - 1) * APP_PAGE_SIZE;
  const items = all.slice(start, start + APP_PAGE_SIZE);

  const hasMore = start + APP_PAGE_SIZE < all.length;

  return Response.json({
    page: appPage,
    items,
    hasMore,
    debug: {
      numFound,
      fetched: docs.length,
      usableWithShowDate: all.length,
      returned: items.length,
    },
  });
}
