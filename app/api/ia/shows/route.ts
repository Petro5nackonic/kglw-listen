import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type IaDoc = {
  identifier: string;
  title?: string;
  date?: string;
  publicdate?: string;
  addeddate?: string;

  creator?: string | string[];
  collection?: string | string[];

  coverage?: string;
  venue?: string;

  downloads?: number | string;
  avg_rating?: number | string;
  num_reviews?: number | string;
};

function isKglwDoc(doc: IaDoc): boolean {
  const creator = Array.isArray(doc.creator) ? doc.creator.join(" ") : doc.creator || "";
  const collection = Array.isArray(doc.collection) ? doc.collection.join(" ") : doc.collection || "";

  // Prefer collection membership when present.
  if (collection) {
    const cols = collection.toLowerCase();
    if (cols.includes("kinggizzardandthelizardwizard")) return true;
  }

  const hay = `${doc.identifier || ""} ${doc.title || ""} ${creator}`.toLowerCase();

  // Keep this simple and conservative: opening acts generally won't match these tokens.
  return (
    hay.includes("king gizzard") ||
    hay.includes("kinggizzard") ||
    hay.includes("kglw") ||
    hay.includes("the lizard wizard")
  );
}

function tryNormalizeDate(s: string): string | null {
  if (!s) return null;

  // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  let m = s.match(/(19|20)\d{2}[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])/);
  if (m) return m[0].replace(/[./]/g, "-");

  // YYYYMMDD
  m = s.match(/(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
  if (m) {
    const v = m[0];
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }

  return null;
}

function extractShowDate(doc: IaDoc): string | null {
  const d1 = doc.date ? tryNormalizeDate(String(doc.date)) : null;
  if (d1) return d1;

  const d2 = tryNormalizeDate(doc.identifier || "");
  if (d2) return d2;

  const d3 = tryNormalizeDate(doc.title || "");
  if (d3) return d3;

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
  // Strongly prefer soundboard when available.
  const hintBonus = hint === "SBD" ? 100 : hint === "MATRIX" ? 30 : 0;
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

function venueSlugFromTitle(title?: string): string {
  if (!title) return "unknown";
  const t = title;

  let m = t.match(/Live at (.+?)(?: on \d{4}-\d{2}-\d{2}|\(|$)/i);
  if (m?.[1]) return slugify(m[1]);

  m = t.match(/- Live at (.+?)(?:\(|$)/i);
  if (m?.[1]) return slugify(m[1]);

  return slugify(t.split(" on ")[0] || t);
}

type Continent = "North America" | "South America" | "Europe" | "Asia" | "Africa" | "Oceania" | "Unknown";

function continentFromVenueCoverageTitle(venue?: string, coverage?: string, title?: string): Continent {
  const hay = `${venue || ""} ${coverage || ""} ${title || ""}`.toLowerCase();

  // Oceania
  if (/\b(australia|sydney|melbourne|brisbane|perth|adelaide)\b/.test(hay)) return "Oceania";
  if (/\b(new zealand|nz|auckland|wellington|christchurch)\b/.test(hay)) return "Oceania";

  // North America
  if (/\b(united states|usa|u\.s\.a|\bus\b|canada|mexico)\b/.test(hay)) return "North America";

  // Europe
  if (
    /\b(uk|united kingdom|england|scotland|wales|ireland|london|manchester|glasgow|dublin|belfast|brixton)\b/.test(hay) ||
    /\b(france|paris|germany|berlin|hamburg|munich|netherlands|amsterdam|belgium|brussels|spain|madrid|barcelona|portugal|lisbon|italy|rome|milan|sweden|stockholm|norway|oslo|denmark|copenhagen|finland|helsinki|austria|vienna|switzerland|zurich|poland|warsaw|czech|prague|hungary|budapest|greece|athens|bulgaria|plovdiv)\b/.test(hay)
  )
    return "Europe";

  // Asia
  if (/\b(japan|tokyo|osaka|nagoya|kyoto|singapore|hong kong|taiwan|seoul|korea|bangkok|thailand)\b/.test(hay)) return "Asia";

  // South America
  if (/\b(brazil|rio|sao paulo|argentina|buenos aires|chile|santiago|colombia|bogota)\b/.test(hay)) return "South America";

  // Africa
  if (/\b(south africa|cape town|johannesburg|morocco|egypt)\b/.test(hay)) return "Africa";

  return "Unknown";
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const page = Math.max(1, Number(sp.get("page") || "1"));
  const years = sp
    .getAll("year")
    .map((y) => y.trim())
    .filter(Boolean);
  const continents = sp
    .getAll("continent")
    .map((c) => c.trim())
    .filter(Boolean);
  const query = (sp.get("query") || sp.get("q") || "").trim();
  const sort = (sp.get("sort") || "newest").trim().toLowerCase();

  const yearFilters = years.filter((y) => /^\d{4}$/.test(y));
  const continentFilters = continents.filter((c) => c && c !== "All");

  const PAGE_SIZE = 25;

  // Base query — broaden slightly so “weirdly tagged” uploads still come through.
  // Include Live Music Archive items (`etree`), which can otherwise be missed.
  let q =
    `mediatype:(audio OR etree) AND (` +
    `(collection:(KingGizzardAndTheLizardWizard)` +
    ` OR creator:("King Gizzard & The Lizard Wizard")` +
    ` OR creator:("King Gizzard And The Lizard Wizard")` +
    ` OR identifier:(kglw*)` +
    ` OR title:("King Gizzard")` +
    ` OR subject:("King Gizzard"))` +
    `)`;

  // ✅ Year filter(s): match identifier/title, NOT IA date field
  if (yearFilters.length > 0) {
    q +=
      " AND (" +
      yearFilters.map((y) => `(identifier:(*${y}*) OR title:(*${y}*))`).join(" OR ") +
      ")";
  }

  const fields = [
    "identifier",
    "title",
    "date",
    "publicdate",
    "addeddate",
    "creator",
    "collection",
    "coverage",
    "venue",
    "downloads",
    "avg_rating",
    "num_reviews",
  ];

  // We will page through IA results and then locally sort by extracted show date.
  // This prevents “missing date field in advancedsearch” from hiding shows.
  const IA_ROWS = 500;
  const MAX_DOCS = 20000; // safety cap
  const MAX_IA_PAGES = Math.ceil(MAX_DOCS / IA_ROWS);

  // Use a stable sort that IA *does* reliably have: addeddate desc
  const SORT = "addeddate desc";

  let iaPage = 1;
  let docs: IaDoc[] = [];

  while (iaPage <= MAX_IA_PAGES) {
    const url =
      "https://archive.org/advancedsearch.php" +
      `?q=${encodeURIComponent(q)}` +
      fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
      `&rows=${IA_ROWS}&page=${iaPage}&output=json` +
      `&sort[]=${encodeURIComponent(SORT)}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return Response.json({ page, items: [], hasMore: false, error: `Archive request failed (page ${iaPage})` }, { status: 502 });
    }

    const data: any = await res.json();
    const batch: IaDoc[] = data?.response?.docs || [];
    if (batch.length === 0) break;

    docs = docs.concat(batch);
    if (docs.length >= MAX_DOCS) break;

    iaPage++;
  }

  // Build recordings (derive showDate even if advancedsearch date is missing)
  const recordings = docs
    .map((d) => {
      if (!isKglwDoc(d)) return null;

      const showDate = extractShowDate(d);
      if (!showDate) return null;

      const venueSlug = venueSlugFromTitle(d.title);
      const showKey = `${showDate}|${venueSlug}`;

      const showContinent = continentFromVenueCoverageTitle(d.venue, d.coverage, d.title);

      // Server continent filter(s)
      if (continentFilters.length > 0 && !continentFilters.includes(showContinent)) return null;

      return {
        identifier: d.identifier,
        title: d.title || d.identifier,
        showDate,
        showKey,
        continent: showContinent,
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
  const groups = new Map<string, { showKey: string; showDate: string; title: string; sources: any[]; continent: Continent }>();
  for (const r of recordings) {
    const g = groups.get(r.showKey);
    if (!g) {
      groups.set(r.showKey, {
        showKey: r.showKey,
        showDate: r.showDate,
        title: r.title,
        sources: [r],
        continent: r.continent,
      });
    } else {
      g.sources.push(r);
      if ((g.title?.length || 0) < (r.title?.length || 0)) g.title = r.title;
      // keep “best known” continent if some sources are Unknown
      if (g.continent === "Unknown" && r.continent !== "Unknown") g.continent = r.continent;
    }
  }

  // Build show list w default source and a plays metric (sum of Archive.org downloads across sources)
  const shows = Array.from(groups.values())
    .map((g) => {
      const sources = g.sources.sort((a, b) => b.score - a.score);
      const best = sources[0];
      const plays = sources.reduce((sum, s) => sum + (typeof s.downloads === "number" ? s.downloads : 0), 0);

      return {
        showKey: g.showKey,
        showDate: g.showDate,
        title: g.title,
        defaultId: best.identifier,
        sourcesCount: sources.length,
        artwork: best.artwork,
        continent: g.continent,
        plays,
      };
    });

  // Sort
  const sortedShows = shows.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return Date.parse(a.showDate) - Date.parse(b.showDate);
      case "most":
      case "most-played":
      case "most_played":
        return (b.plays || 0) - (a.plays || 0) || Date.parse(b.showDate) - Date.parse(a.showDate);
      case "least":
      case "least-played":
      case "least_played":
        return (a.plays || 0) - (b.plays || 0) || Date.parse(b.showDate) - Date.parse(a.showDate);
      case "newest":
      default:
        return Date.parse(b.showDate) - Date.parse(a.showDate);
    }
  });

  const qLower = query.toLowerCase();
  const searchedShows = query
    ? sortedShows.filter((s) => {
        const haystack = `${s.showDate} ${s.title} ${s.continent} ${s.showKey}`.toLowerCase();
        return haystack.includes(qLower);
      })
    : sortedShows;

  const yearCounts = new Map<string, number>();
  const continentCounts = new Map<string, number>();
  for (const s of searchedShows) {
    const y = s.showDate?.slice(0, 4);
    if (y && /^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
    const c = s.continent;
    if (c && c !== "Unknown") continentCounts.set(c, (continentCounts.get(c) || 0) + 1);
  }

  const facets = {
    years: Array.from(yearCounts.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([value, count]) => ({ value, count })),
    continents: Array.from(continentCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
  };

  // App pagination
  const start = (page - 1) * PAGE_SIZE;
  const items = searchedShows.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < searchedShows.length;

  return Response.json({
    page,
    items,
    hasMore,
    facets,
    debug: {
      years: yearFilters.length > 0 ? yearFilters : ["All"],
      continents: continentFilters.length > 0 ? continentFilters : ["All"],
      query,
      sort,
      fetchedDocs: docs.length,
      recordings: recordings.length,
      uniqueShows: shows.length,
      searchedShows: searchedShows.length,
      iaPagesUsed: iaPage,
    },
  });
}
