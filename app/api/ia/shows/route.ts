import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Doc = { identifier: string; title?: string; date?: string };

function extractDate(doc: Doc): string | null {
  const idMatch = doc.identifier?.match(/\d{4}-\d{2}-\d{2}/);
  if (idMatch) return idMatch[0];

  const title = doc.title || "";
  const titleMatch = title.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
  if (titleMatch) return titleMatch[0];

  const d = doc.date || "";
  const dateMatch = d.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
  if (dateMatch) return dateMatch[0];

  return null;
}

async function fetchArchivePage(page: number, rows: number) {
  const q = `identifier:(kglw*) AND mediatype:(audio)`;
  const url =
    `https://archive.org/advancedsearch.php` +
    `?q=${encodeURIComponent(q)}` +
    `&fl[]=identifier&fl[]=title&fl[]=date` +
    `&rows=${rows}` +
    `&page=${page}` +
    `&output=json`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Archive request failed");

  const data: any = await res.json();
  const docs = (data?.response?.docs || []) as Doc[];
  const numFound = Number(data?.response?.numFound || 0);

  return { docs, numFound };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // This is YOUR app page for infinite scroll (logical page)
  const appPage = Math.max(1, Number(sp.get("page") || "1"));

  // How many cards you want to return per app page
  const APP_PAGE_SIZE = 25;

  // We’ll pull more from Archive than we need, then sort + slice.
  // Increase this if you still see gaps.
  const ARCHIVE_ROWS = 200;
  const ARCHIVE_PAGES_PER_REQUEST = 3; // pulls up to 600 docs per API call

  // Start pulling Archive pages based on appPage, so later scrolls continue
  const startArchivePage = (appPage - 1) * ARCHIVE_PAGES_PER_REQUEST + 1;

  let all: Array<{
    identifier: string;
    title?: string;
    date?: string;
    showDate: string | null;
  }> = [];

  let numFound = 0;

  for (let i = 0; i < ARCHIVE_PAGES_PER_REQUEST; i++) {
    const archivePage = startArchivePage + i;
    const { docs, numFound: nf } = await fetchArchivePage(archivePage, ARCHIVE_ROWS);
    numFound = nf;

    all.push(
      ...docs.map((d) => ({
        identifier: d.identifier,
        title: d.title,
        date: d.date,
        showDate: extractDate(d),
      }))
    );
  }

  // Optional: push unknown dates to bottom (recommended)
  all = all.filter((x) => x.showDate);

  // Dedupe by identifier
  const seen = new Set<string>();
  all = all.filter((x) => {
    if (seen.has(x.identifier)) return false;
    seen.add(x.identifier);
    return true;
  });

  // Global sort newest -> oldest
  all.sort((a, b) => Date.parse(b.showDate!) - Date.parse(a.showDate!));

  // Now take one logical app page
  const items = all.slice(0, APP_PAGE_SIZE);

  // We can’t perfectly know "hasMore" without more state,
  // but this works well enough for infinite scroll:
  const hasMore = (startArchivePage + ARCHIVE_PAGES_PER_REQUEST) * ARCHIVE_ROWS < numFound;

  return Response.json({
    page: appPage,
    items,
    hasMore,
    debug: {
      startArchivePage,
      archivePagesPulled: ARCHIVE_PAGES_PER_REQUEST,
      archiveRows: ARCHIVE_ROWS,
      returned: items.length,
    },
  });
}
