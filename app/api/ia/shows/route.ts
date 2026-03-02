import { NextRequest } from "next/server";
import { formatDuration } from "@/utils/formatDuration";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SHOWS_RESPONSE_CACHE_TTL_MS = 1000 * 90;

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

type IaMetadataFile = {
  name?: string;
  title?: string;
  track?: string;
  length?: string | number;
};

type Recording = {
  identifier: string;
  title: string;
  showDate: string;
  showKey: string;
  city?: string;
  state?: string;
  country?: string;
  venueText?: string;
  locationText?: string;
  continent: Continent;
  artwork: string;
  downloads: number;
  avg_rating: number;
  num_reviews: number;
  hint: "SBD" | "AUD" | "MATRIX" | "UNKNOWN";
  score: number;
};

type ShowListItem = {
  showKey: string;
  showDate: string;
  title: string;
  city?: string;
  state?: string;
  country?: string;
  venueText?: string;
  locationText?: string;
  defaultId: string;
  sourcesCount: number;
  artwork: string;
  continent: Continent;
  plays: number;
  matchedSongSeconds?: number | null;
  matchedSongTitle?: string | null;
  matchedSongLength?: string | null;
  matchedSongUrl?: string | null;
  showLengthSeconds?: number | null;
  showTrackCount?: number | null;
  specialTag?: "ORCHESTRA" | "RAVE" | "ACOUSTIC";
};

type SpecialTag = "ORCHESTRA" | "RAVE" | "ACOUSTIC";
type ShowTypeFilter = "ORCHESTRA" | "RAVE" | "ACOUSTIC" | "STANDARD";

type KglwShowRow = {
  showdate?: string;
  showtitle?: string;
  venuename?: string;
  location?: string;
  city?: string;
  artist_id?: number;
};

type KglwTagEntry = {
  tag: SpecialTag;
  venueCandidates: string[];
};

const KGLW_API_ROOT = "https://kglw.net/api/v2";
const KGLW_TAG_TITLES: Record<SpecialTag, string> = {
  ORCHESTRA: "Orchestra Show",
  RAVE: "Rave Show",
  ACOUSTIC: "Acoustic Show",
};
const KGLW_TAG_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
let kglwTagCache:
  | { expiresAt: number; byDate: Map<string, KglwTagEntry[]> }
  | null = null;

const VENUE_STOP_WORDS = new Set([
  "live",
  "at",
  "in",
  "on",
  "the",
  "and",
  "king",
  "gizzard",
  "lizard",
  "wizard",
  "set",
  "bootleg",
  "official",
]);

const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};
const US_STATE_NAME_TO_ABBR = new Map(
  Object.entries(US_STATE_ABBR_TO_NAME).map(([abbr, name]) => [name.toLowerCase(), abbr]),
);

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

function parseNum(x: unknown): number {
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

function specialTagFromShowTitle(showtitle?: string): SpecialTag | null {
  const t = String(showtitle || "").toLowerCase();
  if (t.includes("orchestra")) return "ORCHESTRA";
  if (t.includes("rave")) return "RAVE";
  if (t.includes("acoustic")) return "ACOUSTIC";
  return null;
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

function venuePhraseFromTitle(title?: string): string {
  if (!title) return "";
  let m = title.match(
    /live\s+(?:at|in)\s+(.+?)(?:\s+on\s+(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\(|$)/i,
  );
  if (m?.[1]) return m[1];

  m = title.match(/-\s*live\s+(?:at|in)\s+(.+?)(?:\(|$)/i);
  if (m?.[1]) return m[1];

  return title;
}

function venueTokens(title?: string): Set<string> {
  const phrase = venuePhraseFromTitle(title)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b\d{1,2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = phrase
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !VENUE_STOP_WORDS.has(t));
  return new Set(tokens);
}

function venueLooksSame(aTitle: string, bTitle: string): boolean {
  const a = venueTokens(aTitle);
  const b = venueTokens(bTitle);
  if (a.size === 0 || b.size === 0) return false;

  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;

  const minSize = Math.min(a.size, b.size);
  if (overlap >= 2) return true;
  if (minSize <= 2 && overlap >= 1) return true;

  const union = new Set([...a, ...b]).size || 1;
  const jaccard = overlap / union;
  return jaccard >= 0.45;
}

function slugTokenSet(value: string): Set<string> {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split("-")
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !VENUE_STOP_WORDS.has(t)),
  );
}

function venueSlugMatches(showVenueSlug: string, candidates: string[]): boolean {
  const showSlug = String(showVenueSlug || "");
  if (!showSlug) return false;

  for (const c of candidates) {
    if (!c) continue;
    if (c === showSlug) return true;
    if (c.includes(showSlug) || showSlug.includes(c)) return true;
  }

  const showTokens = slugTokenSet(showSlug);
  if (showTokens.size === 0) return false;
  for (const c of candidates) {
    const cTokens = slugTokenSet(c);
    if (cTokens.size === 0) continue;
    let overlap = 0;
    for (const t of showTokens) if (cTokens.has(t)) overlap++;
    if (overlap >= 2) return true;
    if (Math.min(showTokens.size, cTokens.size) <= 2 && overlap >= 1) return true;
  }
  return false;
}

async function fetchKglwShowsForTitle(title: string): Promise<KglwShowRow[]> {
  const titlePath = encodeURIComponent(title).replace(/%20/g, "+");
  const url =
    `${KGLW_API_ROOT}/shows/showtitle/${titlePath}.json` +
    "?order_by=showdate&direction=asc&limit=2000";
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      // KGLW API can return 403 for non-browser default user agents.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: KglwShowRow[] };
  return Array.isArray(data?.data) ? data.data : [];
}

async function getKglwSpecialTagsByDate(): Promise<Map<string, KglwTagEntry[]>> {
  const now = Date.now();
  if (kglwTagCache && kglwTagCache.expiresAt > now) return kglwTagCache.byDate;

  try {
    const byDate = new Map<string, KglwTagEntry[]>();
    const requests = Object.entries(KGLW_TAG_TITLES).map(async ([tag, title]) => {
      const rows = await fetchKglwShowsForTitle(title);
      return { tag: tag as SpecialTag, rows };
    });
    const results = await Promise.all(requests);

    for (const result of results) {
      for (const row of result.rows) {
        if (Number(row.artist_id) !== 1) continue;
        const date = String(row.showdate || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

        const candidates = Array.from(
          new Set(
            [row.venuename, row.city, row.location]
              .map((s) => slugify(String(s || "")))
              .filter(Boolean),
          ),
        );
        const list = byDate.get(date) || [];
        list.push({
          tag: result.tag,
          venueCandidates: candidates,
        });
        byDate.set(date, list);
      }
    }

    kglwTagCache = {
      expiresAt: now + KGLW_TAG_CACHE_TTL_MS,
      byDate,
    };
    return byDate;
  } catch {
    return new Map<string, KglwTagEntry[]>();
  }
}

function applySpecialTagsToShows(
  shows: ShowListItem[],
  byDate: Map<string, KglwTagEntry[]>,
): ShowListItem[] {
  return shows.map((s) => {
    const entries = byDate.get(s.showDate) || [];
    if (entries.length === 0) return s;
    if (entries.length === 1) return { ...s, specialTag: entries[0].tag };

    const venueSlug = (s.showKey.split("|")[1] || "").toLowerCase();
    const match = entries.find((e) => venueSlugMatches(venueSlug, e.venueCandidates));
    if (!match) return s;
    return { ...s, specialTag: match.tag };
  });
}

function toShowTypeFilter(input: string): ShowTypeFilter | null {
  const v = String(input || "").trim().toLowerCase();
  if (v === "orchestra") return "ORCHESTRA";
  if (v === "rave") return "RAVE";
  if (v === "acoustic") return "ACOUSTIC";
  if (v === "standard") return "STANDARD";
  return null;
}

function filterByShowTypes(
  shows: ShowListItem[],
  filters: ShowTypeFilter[],
): ShowListItem[] {
  if (filters.length === 0) return shows;
  const wanted = new Set(filters);
  return shows.filter((s) => {
    if (s.specialTag === "ORCHESTRA") return wanted.has("ORCHESTRA");
    if (s.specialTag === "RAVE") return wanted.has("RAVE");
    if (s.specialTag === "ACOUSTIC") return wanted.has("ACOUSTIC");
    return wanted.has("STANDARD");
  });
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

function cityFromVenueCoverage(venue?: string, coverage?: string): string {
  const pickCity = (raw: string): string => {
    const text = String(raw || "").trim();
    if (!text) return "";
    // Common IA shape: "Sydney, Australia"
    if (text.includes(",")) {
      const first = text.split(",")[0]?.trim() || "";
      if (first) return first;
    }
    // Some values use separators like "Sydney - Australia".
    if (text.includes(" - ")) {
      const first = text.split(" - ")[0]?.trim() || "";
      if (first) return first;
    }
    return text;
  };

  const fromCoverage = pickCity(String(coverage || ""));
  if (fromCoverage) return fromCoverage;
  return pickCity(String(venue || ""));
}

function parseLocationDetails(
  venue?: string,
  coverage?: string,
  title?: string,
): {
  city?: string;
  state?: string;
  country?: string;
  venueText?: string;
  locationText?: string;
} {
  const coverageText = String(coverage || "").trim();
  const venueRaw = String(venue || "").trim();
  const venueText = venuePhraseFromTitle(title);
  const locationText = [coverageText, venueRaw, venueText].filter(Boolean).join(" | ");
  const city = cityFromVenueCoverage(venue, coverage) || undefined;

  const fromCoverage = coverageText || venueRaw;
  const parts = fromCoverage
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let state: string | undefined;
  let country: string | undefined;
  if (parts.length >= 2) {
    const maybeState = parts[1];
    const maybeCountry = parts[parts.length - 1];
    const abbr = maybeState.toUpperCase();
    if (US_STATE_ABBR_TO_NAME[abbr]) {
      state = US_STATE_ABBR_TO_NAME[abbr];
      country = "United States";
    } else {
      const mapped = US_STATE_NAME_TO_ABBR.get(maybeState.toLowerCase());
      if (mapped) {
        state = US_STATE_ABBR_TO_NAME[mapped];
        country = "United States";
      }
    }
    if (!country && maybeCountry) country = maybeCountry;
  }

  const hay = `${coverageText} ${venueRaw}`.toLowerCase();
  if (!country && /\b(usa|u\.s\.a|united states|us)\b/.test(hay)) {
    country = "United States";
  }

  return {
    city,
    state,
    country,
    venueText: venueText || undefined,
    locationText: locationText || undefined,
  };
}

function buildRecordingsFromDocs(input: IaDoc[], continentFilters: string[]): Recording[] {
  return input
    .map((d) => {
      if (!isKglwDoc(d)) return null;

      const showDate = extractShowDate(d);
      if (!showDate) return null;

      const venueSlug = venueSlugFromTitle(d.title);
      const showKey = `${showDate}|${venueSlug}`;
      const showContinent = continentFromVenueCoverageTitle(
        d.venue,
        d.coverage,
        d.title,
      );
      const location = parseLocationDetails(d.venue, d.coverage, d.title);

      if (
        continentFilters.length > 0 &&
        !continentFilters.includes(showContinent)
      ) {
        return null;
      }

      return {
        identifier: d.identifier,
        title: d.title || d.identifier,
        showDate,
        showKey,
        city: location.city,
        state: location.state,
        country: location.country,
        venueText: location.venueText,
        locationText: location.locationText,
        continent: showContinent,
        artwork: `https://archive.org/services/img/${encodeURIComponent(
          d.identifier,
        )}`,
        downloads: parseNum(d.downloads),
        avg_rating: parseNum(d.avg_rating),
        num_reviews: parseNum(d.num_reviews),
        hint: sourceHint(d.identifier, d.title),
        score: scoreSource(d),
      };
    })
    .filter(Boolean) as Recording[];
}

function buildShowsFromRecordings(recordings: Recording[]): ShowListItem[] {
  const groups = new Map<
    string,
    {
      showKey: string;
      showDate: string;
      title: string;
      city?: string;
      state?: string;
      country?: string;
      venueText?: string;
      locationText?: string;
      sources: Recording[];
      continent: Continent;
    }
  >();

  for (const r of recordings) {
    const g = groups.get(r.showKey);
    if (!g) {
      groups.set(r.showKey, {
        showKey: r.showKey,
        showDate: r.showDate,
        title: r.title,
        city: r.city,
        state: r.state,
        country: r.country,
        venueText: r.venueText,
        locationText: r.locationText,
        sources: [r],
        continent: r.continent,
      });
      continue;
    }
    g.sources.push(r);
    if ((g.title?.length || 0) < (r.title?.length || 0)) g.title = r.title;
    if (!g.city && r.city) g.city = r.city;
    if (!g.state && r.state) g.state = r.state;
    if (!g.country && r.country) g.country = r.country;
    if (!g.venueText && r.venueText) g.venueText = r.venueText;
    if (!g.locationText && r.locationText) g.locationText = r.locationText;
    if (g.continent === "Unknown" && r.continent !== "Unknown") {
      g.continent = r.continent;
    }
  }

  const grouped = Array.from(groups.values());

  // Second pass: merge same-date variants where venue text differs slightly.
  const mergedByDate = new Map<string, typeof grouped>();
  for (const g of grouped) {
    const list = mergedByDate.get(g.showDate) || [];
    const existing = list.find((x) => venueLooksSame(x.title, g.title));
    if (!existing) {
      list.push(g);
      mergedByDate.set(g.showDate, list);
      continue;
    }

    existing.sources.push(...g.sources);
    if ((existing.title?.length || 0) < (g.title?.length || 0)) {
      existing.title = g.title;
    }
    if (existing.continent === "Unknown" && g.continent !== "Unknown") {
      existing.continent = g.continent;
    }
  }

  return Array.from(mergedByDate.values())
    .flat()
    .map((g) => {
    const sources = g.sources.sort((a, b) => b.score - a.score);
    const best = sources[0];
    const plays = sources.reduce(
      (sum, s) => sum + (typeof s.downloads === "number" ? s.downloads : 0),
      0,
    );

    return {
      showKey: g.showKey,
      showDate: g.showDate,
      title: g.title,
      city: g.city || undefined,
      state: g.state || undefined,
      country: g.country || undefined,
      venueText: g.venueText || undefined,
      locationText: g.locationText || undefined,
      defaultId: best.identifier,
      sourcesCount: sources.length,
      artwork: best.artwork,
      continent: g.continent,
      plays,
    };
  });
}

function sortShows(shows: ShowListItem[], sort: string): ShowListItem[] {
  return shows.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return Date.parse(a.showDate) - Date.parse(b.showDate);
      case "most":
      case "most-played":
      case "most_played":
        return (
          (b.plays || 0) - (a.plays || 0) ||
          Date.parse(b.showDate) - Date.parse(a.showDate)
        );
      case "least":
      case "least-played":
      case "least_played":
        return (
          (a.plays || 0) - (b.plays || 0) ||
          Date.parse(b.showDate) - Date.parse(a.showDate)
        );
      case "newest":
      default:
        return Date.parse(b.showDate) - Date.parse(a.showDate);
    }
  });
}

function parseLengthToSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }

  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  if (parts.length === 2) {
    const mm = Number(parts[0]);
    const ss = Number(parts[1]);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    const ss = Number(parts[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) {
      return null;
    }
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
}

function isAudioName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.endsWith(".mp3") ||
    n.endsWith(".flac") ||
    n.endsWith(".ogg") ||
    n.endsWith(".m4a") ||
    n.endsWith(".wav")
  );
}

const showPlaybackStatsCache = new Map<
  string,
  { showLengthSeconds: number | null; showTrackCount: number | null }
>();
const showsResponseCache = new Map<
  string,
  { expiresAt: number; payload: unknown }
>();

function audioExtRank(name: string): number {
  const n = name.toLowerCase();
  if (n.endsWith(".flac")) return 1;
  if (n.endsWith(".mp3")) return 2;
  if (n.endsWith(".m4a")) return 3;
  if (n.endsWith(".ogg")) return 4;
  if (n.endsWith(".wav")) return 5;
  return 999;
}

function trackSetRank(fileName: string): number {
  const n = fileName.toLowerCase();
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;
  if (n.includes("audience") || n.includes("matrix") || n.includes("soundboard")) return 3;
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel")) return 12;
  return 5;
}

function parseTrackNum(t?: string): number {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

async function fetchShowPlaybackStats(
  identifier: string,
): Promise<{ showLengthSeconds: number | null; showTrackCount: number | null }> {
  const cached = showPlaybackStatsCache.get(identifier);
  if (cached) return cached;

  async function fetchMetadataWithTimeout(timeoutMs: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(
        `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!res.ok) return null;
      return (await res.json()) as { files?: IaMetadataFile[] };
    } catch {
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // Archive metadata can be slow/intermittent. Retry once with a longer timeout.
  const metadata =
    (await fetchMetadataWithTimeout(3500)) ||
    (await fetchMetadataWithTimeout(7000));
  if (!metadata) {
    return { showLengthSeconds: null, showTrackCount: null };
  }

  const files: IaMetadataFile[] = Array.isArray(metadata.files)
    ? metadata.files
    : [];
  const audioAll = files.filter((f) => {
    const name = String(f?.name || "");
    return Boolean(name) && isAudioName(name);
  });
  if (audioAll.length === 0) {
    return { showLengthSeconds: null, showTrackCount: null };
  }

  const bestSet = Math.min(
    ...audioAll.map((f) => trackSetRank(String(f?.name || ""))),
  );
  const inSet = audioAll.filter(
    (f) => trackSetRank(String(f?.name || "")) === bestSet,
  );
  const bestExt = Math.min(
    ...inSet.map((f) => audioExtRank(String(f?.name || ""))),
  );
  const picked = inSet.filter(
    (f) => audioExtRank(String(f?.name || "")) === bestExt,
  );

  picked.sort((a, b) => {
    const ta = parseTrackNum(a?.track);
    const tb = parseTrackNum(b?.track);
    if (ta !== tb) return ta - tb;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const seen = new Set<string>();
  let total = 0;
  for (const f of picked) {
    const title = String(f?.title || f?.name || "");
    const lenRaw = String(f?.length || "");
    const key = `${title.toLowerCase()}|${lenRaw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sec = parseLengthToSeconds(f?.length);
    if (sec != null) total += sec;
  }

  const out = {
    showLengthSeconds: total > 0 ? total : null,
    showTrackCount: seen.size > 0 ? seen.size : null,
  };
  // Cache only computed results to avoid poisoning cache on transient failures.
  if (out.showTrackCount != null || out.showLengthSeconds != null) {
    showPlaybackStatsCache.set(identifier, out);
  }
  return out;
}

async function fetchSongMatchInfo(
  identifier: string,
  queryLower: string,
): Promise<{ seconds: number | null; title: string | null; length: string | null; url: string | null }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (!res.ok) return { seconds: null, title: null, length: null, url: null };
    const data = (await res.json()) as { files?: IaMetadataFile[] };
    const files: IaMetadataFile[] = Array.isArray(data?.files) ? data.files : [];

    let best: { seconds: number; title: string; length: string; url: string } | null = null;
    for (const f of files) {
      const name = String(f?.name || "");
      if (!name || !isAudioName(name)) continue;
      const rawTitle = String(f?.title || f?.name || "");
      const title = rawTitle.toLowerCase();
      if (!title.includes(queryLower) && !name.toLowerCase().includes(queryLower)) continue;

      const sec = parseLengthToSeconds(f?.length);
      if (sec == null) continue;
      const length = formatDuration(String(f?.length || "").trim() || null) || null;
      const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(name)}`;
      if (!best || sec > best.seconds) {
        best = {
          seconds: sec,
          title: rawTitle,
          length: length || `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`,
          url,
        };
      }
    }
    return {
      seconds: best?.seconds ?? null,
      title: best?.title ?? null,
      length: best?.length ?? null,
      url: best?.url ?? null,
    };
  } catch {
    return { seconds: null, title: null, length: null, url: null };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => run(),
  );
  await Promise.all(workers);
  return out;
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
  const showTypes = sp
    .getAll("showType")
    .map((s) => toShowTypeFilter(s))
    .filter(Boolean) as ShowTypeFilter[];
  const query = (sp.get("query") || sp.get("q") || "").trim();
  const sort = (sp.get("sort") || "newest").trim().toLowerCase();

  const yearFilters = years.filter((y) => /^\d{4}$/.test(y));
  const continentFilters = continents.filter((c) => c && c !== "All");
  const showTypeFilters = [...showTypes].sort();
  const cacheKey = JSON.stringify({
    v: 1,
    page,
    years: [...yearFilters].sort(),
    continents: [...continentFilters].sort(),
    showTypes: showTypeFilters,
    query: query.toLowerCase(),
    sort,
  });
  const cached = showsResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload);
  }

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
  // Keep requests responsive; very large scans can stall UI loading.
  const MAX_IA_PAGES = query ? 2 : 3;

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

    const data = (await res.json()) as { response?: { docs?: IaDoc[] } };
    const batch: IaDoc[] = Array.isArray(data?.response?.docs)
      ? data.response.docs
      : [];
    if (batch.length === 0) break;

    docs = docs.concat(batch);
    iaPage++;
  }

  const recordings = buildRecordingsFromDocs(docs, continentFilters);
  const shows = buildShowsFromRecordings(recordings);
  const kglwSpecialTagsByDate = await getKglwSpecialTagsByDate();
  const taggedShows = applySpecialTagsToShows(shows, kglwSpecialTagsByDate);
  const typedShows = filterByShowTypes(taggedShows, showTypes);
  const sortedShows = sortShows(typedShows, sort);

  const qLower = query.toLowerCase();
  const searchedShows = query
    ? sortedShows.filter((s) => {
        const normalizedShowKey = String(s.showKey || "").replaceAll("-", " ");
        const haystack = [
          s.showDate,
          s.title,
          s.continent,
          s.city,
          s.state,
          s.country,
          s.venueText,
          s.locationText,
          s.showKey,
          normalizedShowKey,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(qLower);
      })
    : sortedShows;

  // Song/track matches come from Archive full-text indexing.
  // This catches shows where the query appears in tracklists/metadata even when
  // the venue/title itself does not contain the term.
  let songMatchedShows: ShowListItem[] = [];
  if (query && page === 1) {
    const songDocs: IaDoc[] = [];
    const songTerm = query.replace(/"/g, "").trim();

    if (songTerm) {
      const SONG_ROWS = 500;
      const MAX_SONG_DOCS = 1500;
      const MAX_SONG_PAGES = Math.ceil(MAX_SONG_DOCS / SONG_ROWS);
      let songPage = 1;

      while (songPage <= MAX_SONG_PAGES) {
        const songQ = `${q} AND text:("${songTerm}")`;
        const songUrl =
          "https://archive.org/advancedsearch.php" +
          `?q=${encodeURIComponent(songQ)}` +
          fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
          `&rows=${SONG_ROWS}&page=${songPage}&output=json` +
          `&sort[]=${encodeURIComponent(SORT)}`;

        const songRes = await fetch(songUrl, { cache: "no-store" });
        if (!songRes.ok) break;

        const songData = (await songRes.json()) as { response?: { docs?: IaDoc[] } };
        const batch: IaDoc[] = Array.isArray(songData?.response?.docs)
          ? songData.response.docs
          : [];
        if (batch.length === 0) break;

        songDocs.push(...batch);
        if (songDocs.length >= MAX_SONG_DOCS) break;

        songPage++;
      }

      const songRecordings = buildRecordingsFromDocs(songDocs, continentFilters);
      songMatchedShows = sortShows(
        filterByShowTypes(
          applySpecialTagsToShows(
            buildShowsFromRecordings(songRecordings),
            kglwSpecialTagsByDate,
          ),
          showTypes,
        ),
        sort,
      );

      // Compute per-show longest matching track length for sort/filter UX.
      const MAX_SONG_LENGTH_LOOKUPS = 20;
      const target = songMatchedShows.slice(0, MAX_SONG_LENGTH_LOOKUPS);
      const lengths = await withConcurrency(target, 8, async (s) => {
        const info = await fetchSongMatchInfo(
          s.defaultId,
          songTerm.toLowerCase(),
        );
        return { showKey: s.showKey, info };
      });
      const lengthMap = new Map(lengths.map((x) => [x.showKey, x.info]));
      songMatchedShows = songMatchedShows.map((s) => ({
        ...s,
        matchedSongSeconds: lengthMap.get(s.showKey)?.seconds ?? null,
        matchedSongTitle: lengthMap.get(s.showKey)?.title ?? null,
        matchedSongLength: lengthMap.get(s.showKey)?.length ?? null,
        matchedSongUrl: lengthMap.get(s.showKey)?.url ?? null,
      }));
    }
  }

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
  let items = searchedShows.slice(start, start + PAGE_SIZE);

  const isLengthSort = sort === "show_length_longest" || sort === "show_length_shortest";
  if (isLengthSort) {
    items = items.sort((a, b) => {
      const av = typeof a.showLengthSeconds === "number" ? a.showLengthSeconds : -1;
      const bv = typeof b.showLengthSeconds === "number" ? b.showLengthSeconds : -1;
      if (sort === "show_length_shortest") return av - bv;
      return bv - av;
    });
  }
  const hasMore = start + PAGE_SIZE < searchedShows.length;
  const payload = {
    page,
    items,
    hasMore,
    venueTotal: searchedShows.length,
    song: query
      ? {
          query,
          total: songMatchedShows.length,
          items: songMatchedShows,
        }
      : undefined,
    facets,
    debug: {
      years: yearFilters.length > 0 ? yearFilters : ["All"],
      continents: continentFilters.length > 0 ? continentFilters : ["All"],
      showTypes: showTypes.length > 0 ? showTypes : ["All"],
      query,
      sort,
      fetchedDocs: docs.length,
      recordings: recordings.length,
      uniqueShows: shows.length,
      searchedShows: searchedShows.length,
      iaPagesUsed: iaPage,
    },
  };
  showsResponseCache.set(cacheKey, {
    expiresAt: Date.now() + SHOWS_RESPONSE_CACHE_TTL_MS,
    payload,
  });
  return Response.json(payload);
}
