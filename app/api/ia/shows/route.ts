import { NextRequest } from "next/server";
import { formatDuration } from "@/utils/formatDuration";
import { inferCountryFromVenueName } from "@/utils/venueCountryMap";

// Route is inherently dynamic (reads search params); keep it cache-friendly
// via the Cache-Control headers below rather than force-dynamic.
export const maxDuration = 60;
const SHOWS_RESPONSE_CACHE_TTL_MS = 1000 * 60 * 10;
const UPSTREAM_TIMEOUT_MS = 10000;
const ALBUM_MATCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
};

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
type KglwShowsResponse = {
  error?: boolean;
  data?: KglwShowRow[];
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
const DISCOGRAPHY_ALBUM_TITLES = [
  "12 Bar Bruise",
  "Eyes Like The Sky",
  "Float Along - Fill Your Lungs",
  "Oddments",
  "I'm In Your Mind Fuzz",
  "Quarters!",
  "Paper Mache Dream Balloon",
  "Nonagon Infinity",
  "Flying Microtonal Banana",
  "Murder of the Universe",
  "Sketches of Brunswick East",
  "Polygondwanaland",
  "Gumboot Soup",
  "Fishing For Fishies",
  "Infest the Rats' Nest",
  "K.G.",
  "L.W.",
  "Butterfly 3000",
  "Made In Timeland",
  "Omnium Gatherum",
  "Ice, Death, Planets, Lungs, Mushrooms and Lava",
  "Laminated Denim",
  "Changes",
  "PetroDragonic Apocalypse",
  "The Silver Chord",
  "The Silver Chord (Extended Mix)",
  "Flight B741",
  "Phantom Island",
];
const DISCOGRAPHY_ALBUMS_BY_KEY = new Set(
  DISCOGRAPHY_ALBUM_TITLES.map((a) => a.trim().toLowerCase()),
);
const DISCOGRAPHY_ALBUM_TRACK_FALLBACKS: Record<string, string[]> = {
  "flight b741": [
    "Mirage City",
    "Antarctica",
    "Raw Feel",
    "Field of Vision",
    "Hog Calling Contest",
    "Le Risque",
    "Flight b741",
    "Sad Pilot",
    "Rats in the Sky",
    "Daily Blues",
  ],
  "i'm in your mind fuzz": [
    "I'm In Your Mind",
    "I'm Not In Your Mind",
    "Cellophane",
    "I'm In Your Mind Fuzz",
    "Empty",
    "Hot Water",
    "Am I In Heaven ?",
    "Slow Jam 1",
    "Satan Speeds Up",
    "Her And I (Slow Jam 2)",
  ],
  "infest the rats' nest": [
    "Planet B",
    "Mars for the Rich",
    "Organ Farmer",
    "Superbug",
    "Venusian 1",
    "Perihelion",
    "Venusian 2",
    "Self-Immolate",
    "Hell",
  ],
  "nonagon infinity": [
    "Robot Stop",
    "Big Fig Wasp",
    "Gamma Knife",
    "People-Vultures",
    "Mr. Beat",
    "Evil Death Roll",
    "Invisible Face",
    "Wah Wah",
    "Road Train",
  ],
  "petrodragonic apocalypse": [
    "Motor Spirit",
    "Supercell",
    "Converge",
    "Witchcraft",
    "Gila Monster",
    "Dragon",
    "Flamethrower",
  ],
  "the silver chord": [
    "Theia",
    "The Silver Cord",
    "Set",
    "Chang'e",
    "Gilgamesh",
    "Swan Song",
    "Extinction",
  ],
};

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
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let res: Response;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 3000);
    res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        // KGLW API can return 403 for non-browser default user agents.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
  } catch {
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

function showTypeLabelForShow(show: ShowListItem): "Rave" | "Acoustic" | "Orchestra" | "Standard" {
  if (show.specialTag === "RAVE") return "Rave";
  if (show.specialTag === "ACOUSTIC") return "Acoustic";
  if (show.specialTag === "ORCHESTRA") return "Orchestra";
  return "Standard";
}

async function fetchKglwFallbackShows(): Promise<KglwShowRow[]> {
  try {
    const url =
      `${KGLW_API_ROOT}/shows.json` +
      "?artist_id=1&order_by=showdate&direction=desc&limit=4000";
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let res: Response;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 6000);
      res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (!res.ok) return [];
    const payload = (await res.json()) as KglwShowsResponse;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.filter((r) => Number(r.artist_id) === 1);
  } catch {
    return [];
  }
}

type Continent = "North America" | "South America" | "Europe" | "Asia" | "Africa" | "Oceania" | "Unknown";

const COUNTRY_TO_CONTINENT: Record<string, Continent> = {
  "united states": "North America",
  usa: "North America",
  canada: "North America",
  mexico: "North America",
  brazil: "South America",
  argentina: "South America",
  chile: "South America",
  colombia: "South America",
  peru: "South America",
  uk: "Europe",
  "united kingdom": "Europe",
  england: "Europe",
  ireland: "Europe",
  scotland: "Europe",
  france: "Europe",
  germany: "Europe",
  netherlands: "Europe",
  belgium: "Europe",
  spain: "Europe",
  portugal: "Europe",
  italy: "Europe",
  sweden: "Europe",
  norway: "Europe",
  denmark: "Europe",
  finland: "Europe",
  austria: "Europe",
  switzerland: "Europe",
  poland: "Europe",
  czechia: "Europe",
  "czech republic": "Europe",
  hungary: "Europe",
  greece: "Europe",
  bulgaria: "Europe",
  croatia: "Europe",
  slovakia: "Europe",
  japan: "Asia",
  singapore: "Asia",
  thailand: "Asia",
  korea: "Asia",
  "south korea": "Asia",
  taiwan: "Asia",
  "hong kong": "Asia",
  malaysia: "Asia",
  indonesia: "Asia",
  india: "Asia",
  pakistan: "Asia",
  australia: "Oceania",
  "new zealand": "Oceania",
  "south africa": "Africa",
  morocco: "Africa",
  egypt: "Africa",
};

const CITY_TO_COUNTRY: Record<string, string> = {
  "new york": "United States",
  "los angeles": "United States",
  chicago: "United States",
  "san francisco": "United States",
  "san diego": "United States",
  austin: "United States",
  denver: "United States",
  seattle: "United States",
  boston: "United States",
  "washington dc": "United States",
  atlanta: "United States",
  nashville: "United States",
  detroit: "United States",
  toronto: "Canada",
  montreal: "Canada",
  vancouver: "Canada",
  "mexico city": "Mexico",
  london: "United Kingdom",
  manchester: "United Kingdom",
  dublin: "Ireland",
  paris: "France",
  berlin: "Germany",
  hamburg: "Germany",
  munich: "Germany",
  amsterdam: "Netherlands",
  brussels: "Belgium",
  madrid: "Spain",
  barcelona: "Spain",
  lisbon: "Portugal",
  rome: "Italy",
  milan: "Italy",
  stockholm: "Sweden",
  oslo: "Norway",
  copenhagen: "Denmark",
  helsinki: "Finland",
  vienna: "Austria",
  zurich: "Switzerland",
  warsaw: "Poland",
  prague: "Czechia",
  budapest: "Hungary",
  athens: "Greece",
  tokyo: "Japan",
  osaka: "Japan",
  nagoya: "Japan",
  kyoto: "Japan",
  singapore: "Singapore",
  bangkok: "Thailand",
  seoul: "South Korea",
  "hong kong": "Hong Kong",
  sydney: "Australia",
  melbourne: "Australia",
  brisbane: "Australia",
  perth: "Australia",
  adelaide: "Australia",
  auckland: "New Zealand",
  wellington: "New Zealand",
  christchurch: "New Zealand",
  "sao paulo": "Brazil",
  "rio de janeiro": "Brazil",
  "buenos aires": "Argentina",
  santiago: "Chile",
  bogota: "Colombia",
  "cape town": "South Africa",
  johannesburg: "South Africa",
};

function normalizeGeoKey(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCountryFromCity(city?: string): string | undefined {
  const key = normalizeGeoKey(String(city || ""));
  if (!key) return undefined;
  return CITY_TO_COUNTRY[key];
}

function inferContinentFromCountry(country?: string): Continent | null {
  const key = normalizeGeoKey(String(country || ""));
  if (!key) return null;
  return COUNTRY_TO_CONTINENT[key] || null;
}

function normalizeFilterValue(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAnyFilter(rawValue: string | undefined, normalizedFilters: string[]): boolean {
  if (normalizedFilters.length === 0) return true;
  const normalized = normalizeFilterValue(String(rawValue || ""));
  if (!normalized) return false;
  return normalizedFilters.includes(normalized);
}

function filterShowsByLocationAndVenue(
  shows: ShowListItem[],
  countryFilters: string[],
  cityFilters: string[],
  venueFilters: string[],
): ShowListItem[] {
  if (countryFilters.length === 0 && cityFilters.length === 0 && venueFilters.length === 0) {
    return shows;
  }
  return shows.filter((show) => {
    const countryOk = matchesAnyFilter(show.country, countryFilters);
    if (!countryOk) return false;
    const cityOk = matchesAnyFilter(show.city, cityFilters);
    if (!cityOk) return false;
    const venueLabel = String(show.venueText || show.title || "").trim();
    const venueOk = matchesAnyFilter(venueLabel, venueFilters);
    return venueOk;
  });
}

function continentFromVenueCoverageTitle(
  venue?: string,
  coverage?: string,
  title?: string,
  city?: string,
  country?: string,
): Continent {
  const byCountry = inferContinentFromCountry(country);
  if (byCountry) return byCountry;
  const inferredCountryFromCity = inferCountryFromCity(city);
  const byCity = inferContinentFromCountry(inferredCountryFromCity);
  if (byCity) return byCity;
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
  const looksLikeVenueText = (raw: string): boolean => {
    const text = String(raw || "").trim().toLowerCase();
    if (!text) return false;
    return /\b(stadium|theater|theatre|hall|arena|club|amphithea(?:ter|tre)|pavilion|park|bowl|center|centre|ballroom|auditorium|opera house|casino|coliseum|racecourse|hippodrome|grounds|tent|church|bar|pub|hotel|palace|dome|field|campus|university|college|festival)\b/.test(
      text,
    );
  };
  const pickCity = (raw: string): string => {
    const text = String(raw || "").trim();
    if (!text) return "";
    // Common IA shape: "Sydney, Australia"
    if (text.includes(",")) {
      const first = text.split(",")[0]?.trim() || "";
      if (first && !looksLikeVenueText(first)) return first;
    }
    // Some values use separators like "Sydney - Australia".
    if (text.includes(" - ")) {
      const first = text.split(" - ")[0]?.trim() || "";
      if (first && !looksLikeVenueText(first)) return first;
    }
    // Unstructured single chunk. Only trust it when it still looks like a city.
    if (
      !looksLikeVenueText(text) &&
      !/\d/.test(text) &&
      text.length <= 32 &&
      text.split(/\s+/).length <= 3
    ) {
      return text;
    }
    return "";
  };

  const fromCoverage = pickCity(String(coverage || ""));
  if (fromCoverage) return fromCoverage;
  // Fall back to venue only when it cleanly resembles a city and not a venue label.
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
  if (!country && city) {
    country = inferCountryFromCity(city);
  }
  if (!country) {
    country =
      inferCountryFromVenueName(venueText) ||
      inferCountryFromVenueName(venueRaw) ||
      inferCountryFromVenueName(String(title || ""));
  }

  return {
    city,
    state,
    country,
    venueText: venueText || undefined,
    locationText: locationText || undefined,
  };
}

function cityContextLabelForShow(show: Pick<ShowListItem, "state" | "country">): string {
  const country = String(show.country || "").trim();
  const state = String(show.state || "").trim();
  if (!country) return "";
  if (country === "United States" && state) return `${state}, ${country}`;
  return country;
}

function buildRecordingsFromDocs(input: IaDoc[], continentFilters: string[]): Recording[] {
  return input
    .map((d) => {
      if (!isKglwDoc(d)) return null;

      const showDate = extractShowDate(d);
      if (!showDate) return null;

      const venueSlug = venueSlugFromTitle(d.title);
      const showKey = `${showDate}|${venueSlug}`;
      const location = parseLocationDetails(d.venue, d.coverage, d.title);
      const showContinent = continentFromVenueCoverageTitle(
        d.venue,
        d.coverage,
        d.title,
        location.city,
        location.country,
      );

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

function tokenizeSearchInput(input: string): string[] {
  const tokens = String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 5);
  return tokens;
}

function buildSongTokenQuery(input: string): string {
  const tokens = tokenizeSearchInput(input);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `text:${t}*`).join(" AND ");
}

function buildSongTokenQueryLoose(input: string): string {
  const tokens = tokenizeSearchInput(input);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `text:${t}*`).join(" OR ");
}

function tokenPrefixMatch(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const words = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return false;
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

function queryMatchesByTokens(text: string, rawQuery: string): boolean {
  const q = String(rawQuery || "").toLowerCase().trim();
  if (!q) return true;
  if (String(text || "").toLowerCase().includes(q)) return true;
  const tokens = tokenizeSearchInput(q);
  if (tokens.length === 0) return false;
  return tokenPrefixMatch(text, tokens);
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
const albumMatchShowKeysCache = new Map<string, { expiresAt: number; showKeys: Set<string> }>();
const albumTracksCache = new Map<string, { expiresAt: number; tracks: string[] }>();
let kglwAlbumTrackMapCache:
  | { expiresAt: number; tracksByAlbumKey: Map<string, string[]> }
  | null = null;
const showsResponseCache = new Map<
  string,
  { expiresAt: number; payload: unknown }
>();
const randomPickerUniverseCache = new Map<
  string,
  { expiresAt: number; shows: ShowListItem[] }
>();
let lastGoodDefaultPayload: unknown | null = null;
const RANDOM_PICKER_UNIVERSE_CACHE_TTL_MS = 1000 * 60 * 30;

function hasUsableDefaultIds(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const items = Array.isArray((payload as { items?: unknown[] }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  if (items.length === 0) return false;
  const withIds = items.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const id = String((item as { defaultId?: unknown }).defaultId || "").trim();
    return id.length > 0;
  }).length;
  return withIds >= Math.max(1, Math.floor(items.length * 0.5));
}

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

    const queryTokens = tokenizeSearchInput(queryLower);
    let best: { seconds: number; title: string; length: string; url: string } | null = null;
    for (const f of files) {
      const name = String(f?.name || "");
      if (!name || !isAudioName(name)) continue;
      const rawTitle = String(f?.title || f?.name || "");
      const searchable = `${rawTitle} ${name}`;
      if (
        !tokenPrefixMatch(searchable, queryTokens) &&
        !rawTitle.toLowerCase().includes(queryLower) &&
        !name.toLowerCase().includes(queryLower)
      ) {
        continue;
      }

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

function toApiSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAlbumKey(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchKglwAlbumTrackMap(): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (kglwAlbumTrackMapCache && kglwAlbumTrackMapCache.expiresAt > now) {
    return kglwAlbumTrackMapCache.tracksByAlbumKey;
  }
  try {
    const url =
      `${KGLW_API_ROOT}/albums.json` +
      "?artist_id=1&order_by=releasedate&direction=asc&limit=3000";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return new Map<string, string[]>();
    const payload = (await res.json()) as {
      error?: boolean;
      data?: Array<{
        album_title?: string;
        song_name?: string;
        islive?: number | string;
        artist_id?: number | string;
      }>;
    };
    if (payload?.error) return new Map<string, string[]>();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const map = new Map<string, string[]>();
    const seenByAlbum = new Map<string, Set<string>>();
    for (const row of rows) {
      if (Number(row?.artist_id ?? 0) !== 1) continue;
      if (Number(row?.islive ?? 0) !== 0) continue;
      const albumKey = normalizeAlbumKey(String(row?.album_title || ""));
      const song = String(row?.song_name || "").trim();
      if (!albumKey || !song) continue;
      const seen = seenByAlbum.get(albumKey) || new Set<string>();
      const songKey = song.toLowerCase();
      if (seen.has(songKey)) continue;
      seen.add(songKey);
      seenByAlbum.set(albumKey, seen);
      const list = map.get(albumKey) || [];
      list.push(song);
      map.set(albumKey, list);
    }
    kglwAlbumTrackMapCache = {
      expiresAt: now + ALBUM_MATCH_CACHE_TTL_MS,
      tracksByAlbumKey: map,
    };
    return map;
  } catch {
    return new Map<string, string[]>();
  }
}

async function fetchDiscographyAlbumTracks(albumTitle: string): Promise<string[]> {
  const key = String(albumTitle || "").trim().toLowerCase();
  if (!key) return [];
  const fallback = DISCOGRAPHY_ALBUM_TRACK_FALLBACKS[key];
  const cached = albumTracksCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.tracks;
  const normalized = normalizeAlbumKey(albumTitle);
  const tracksByAlbumKey = await fetchKglwAlbumTrackMap();
  const direct = tracksByAlbumKey.get(normalized);
  if (direct && direct.length > 0) {
    albumTracksCache.set(key, {
      expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
      tracks: direct,
    });
    return direct;
  }
  let bestMatch: string | null = null;
  let bestScore = -1;
  const wantedTokens = new Set(normalized.split(" ").filter((t) => t.length >= 2));
  for (const candidate of tracksByAlbumKey.keys()) {
    let overlap = 0;
    for (const token of wantedTokens) {
      if (candidate.includes(token)) overlap += 1;
    }
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = candidate;
    }
  }
  if (bestMatch && bestScore >= Math.max(2, Math.ceil(wantedTokens.size / 2))) {
    const fuzzy = tracksByAlbumKey.get(bestMatch) || [];
    if (fuzzy.length > 0) {
      albumTracksCache.set(key, {
        expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
        tracks: fuzzy,
      });
      return fuzzy;
    }
  }
  const attempts =
    key === "the silver chord"
      ? [albumTitle, "The Silver Cord"]
      : [albumTitle];
  for (const title of attempts) {
    try {
      const url =
        `${KGLW_API_ROOT}/albums/album_title/${toApiSlug(title)}.json` +
        "?artist_id=1&order_by=position&direction=asc";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        error?: boolean;
        data?: Array<{ song_name?: string; islive?: number | string; position?: number | string }>;
      };
      if (payload?.error) continue;
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const ordered = rows
        .filter((r) => Number(r?.islive ?? 0) === 0)
        .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
      const out: string[] = [];
      const seen = new Set<string>();
      for (const row of ordered) {
        const song = String(row?.song_name || "").trim();
        if (!song) continue;
        const songKey = song.toLowerCase();
        if (seen.has(songKey)) continue;
        seen.add(songKey);
        out.push(song);
      }
      if (out.length > 0) {
        albumTracksCache.set(key, {
          expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
          tracks: out,
        });
        return out;
      }
    } catch {
      // try next attempt
    }
  }
  const safeFallback = Array.isArray(fallback) ? fallback : [];
  albumTracksCache.set(key, {
    expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
    tracks: safeFallback,
  });
  return safeFallback;
}

function tokensForSongTitle(title: string): string[] {
  return tokenizeSearchInput(title).slice(0, 4);
}

function buildAlbumTokenQuery(trackTitles: string[]): string {
  const clauses = trackTitles
    .map((songTitle) => tokensForSongTitle(songTitle))
    .filter((tokens) => tokens.length > 0)
    .map((tokens) => `(${tokens.map((t) => `text:${t}*`).join(" AND ")})`);
  return clauses.length > 0 ? clauses.join(" OR ") : "";
}

async function fetchAlbumMatchedShowKeys(
  albumTitle: string,
  continentFilters: string[],
): Promise<Set<string>> {
  const key = String(albumTitle || "").trim().toLowerCase();
  if (!key) return new Set<string>();
  const cached = albumMatchShowKeysCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.showKeys;

  const trackTitles = await fetchDiscographyAlbumTracks(albumTitle);
  if (trackTitles.length === 0) return new Set<string>();
  const tokenQuery = buildAlbumTokenQuery(trackTitles);
  if (!tokenQuery) return new Set<string>();

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
  const SORT = "addeddate desc";
  const q =
    `mediatype:(audio OR etree) AND (` +
    `(collection:(KingGizzardAndTheLizardWizard)` +
    ` OR creator:("King Gizzard & The Lizard Wizard")` +
    ` OR creator:("King Gizzard And The Lizard Wizard")` +
    ` OR identifier:(kglw*)` +
    ` OR title:("King Gizzard")` +
    ` OR subject:("King Gizzard"))` +
    `) AND (${tokenQuery})`;
  const url =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(q)}` +
    fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
    `&rows=450&page=1&output=json` +
    `&sort[]=${encodeURIComponent(SORT)}`;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return new Set<string>();
    const payload = (await res.json()) as { response?: { docs?: IaDoc[] } };
    const docs = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];
    const shows = buildShowsFromRecordings(buildRecordingsFromDocs(docs, continentFilters));
    const showKeys = new Set(shows.map((s) => s.showKey));
    albumMatchShowKeysCache.set(key, {
      expiresAt: Date.now() + ALBUM_MATCH_CACHE_TTL_MS,
      showKeys,
    });
    return showKeys;
  } catch {
    return new Set<string>();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
  const countries = sp
    .getAll("country")
    .map((c) => c.trim())
    .filter(Boolean);
  const cities = sp
    .getAll("city")
    .map((c) => c.trim())
    .filter(Boolean);
  const venues = sp
    .getAll("venue")
    .map((v) => v.trim())
    .filter(Boolean);
  const showTypes = sp
    .getAll("showType")
    .map((s) => toShowTypeFilter(s))
    .filter(Boolean) as ShowTypeFilter[];
  const albums = sp
    .getAll("album")
    .map((a) => a.trim())
    .filter(Boolean);
  const query = (sp.get("query") || sp.get("q") || "").trim();
  const sort = (sp.get("sort") || "newest").trim().toLowerCase();
  const randomPickMode = sp.get("random") === "1";
  const fastMode = randomPickMode ? false : sp.get("fast") === "1";
  const includeAlbumFacets = sp.get("includeAlbumFacets") === "1";
  const forceRefresh = sp.get("refresh") === "1";

  const yearFilters = years.filter((y) => /^\d{4}$/.test(y));
  const continentFilters = continents.filter((c) => c && c !== "All");
  const countryFilters = Array.from(
    new Set(countries.map((c) => normalizeFilterValue(c)).filter(Boolean)),
  ).sort();
  const cityFilters = Array.from(
    new Set(cities.map((c) => normalizeFilterValue(c)).filter(Boolean)),
  ).sort();
  const venueFilters = Array.from(
    new Set(venues.map((v) => normalizeFilterValue(v)).filter(Boolean)),
  ).sort();
  const showTypeFilters = [...showTypes].sort();
  const albumFilters = Array.from(
    new Set(
      albums
        .map((a) => a.toLowerCase())
        .filter((a) => DISCOGRAPHY_ALBUMS_BY_KEY.has(a)),
    ),
  ).sort();
  const randomUniverseKey = JSON.stringify({
    v: 1,
    mode: "random",
    years: [...yearFilters].sort(),
    continents: [...continentFilters].sort(),
    countries: countryFilters,
    cities: cityFilters,
    venues: venueFilters,
    showTypes: showTypeFilters,
    albums: albumFilters,
    query: query.toLowerCase(),
    sort,
  });
  if (randomPickMode && !forceRefresh) {
    const cachedUniverse = randomPickerUniverseCache.get(randomUniverseKey);
    if (cachedUniverse && cachedUniverse.expiresAt > Date.now() && cachedUniverse.shows.length > 0) {
      const chosen =
        cachedUniverse.shows[Math.floor(Math.random() * cachedUniverse.shows.length)];
      return Response.json(
        {
          item: chosen,
          venueTotal: cachedUniverse.shows.length,
          debug: {
            source: "random-universe-cache",
            years: yearFilters.length > 0 ? yearFilters : ["All"],
            continents: continentFilters.length > 0 ? continentFilters : ["All"],
            countries: countryFilters.length > 0 ? countryFilters : ["All"],
            cities: cityFilters.length > 0 ? cityFilters : ["All"],
            venues: venueFilters.length > 0 ? venueFilters : ["All"],
            showTypes: showTypes.length > 0 ? showTypes : ["All"],
            albums: albumFilters.length > 0 ? albumFilters : ["All"],
            query,
            sort,
          },
        },
        { headers: SUCCESS_CACHE_HEADERS },
      );
    }
  }
  const cacheKey = JSON.stringify({
    v: 2,
    page,
    years: [...yearFilters].sort(),
    continents: [...continentFilters].sort(),
    countries: countryFilters,
    cities: cityFilters,
    venues: venueFilters,
    showTypes: showTypeFilters,
    albums: albumFilters,
    query: query.toLowerCase(),
    sort,
    includeAlbumFacets,
  });
  if (!randomPickMode) {
    const cached = showsResponseCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      const payload = cached.payload;
      if (query) {
        const maybe = payload as {
          items?: unknown[];
          song?: { total?: number; items?: unknown[] };
        };
        const itemCount = Array.isArray(maybe?.items) ? maybe.items.length : 0;
        const songTotal = Number(maybe?.song?.total || 0);
        // Avoid serving sticky empty query caches from transient upstream failures.
        if (itemCount === 0 && songTotal === 0) {
          showsResponseCache.delete(cacheKey);
        } else {
          return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
        }
      } else {
      const isDefaultRootQuery =
        page === 1 &&
        !query &&
        yearFilters.length === 0 &&
        continentFilters.length === 0 &&
        countryFilters.length === 0 &&
        cityFilters.length === 0 &&
        venueFilters.length === 0 &&
        showTypes.length === 0 &&
        albumFilters.length === 0 &&
        sort === "newest";
      if (isDefaultRootQuery && !hasUsableDefaultIds(payload)) {
        showsResponseCache.delete(cacheKey);
      } else {
        return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
      }
      }
    }
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
  const MAX_IA_PAGES = randomPickMode ? (query ? 6 : 12) : fastMode ? 1 : query ? 2 : 3;

  // Use a stable sort that IA *does* reliably have: addeddate desc
  const SORT = "addeddate desc";

  let iaPage = 1;
  let docs: IaDoc[] = [];
  const requestStartedAt = Date.now();

  while (iaPage <= MAX_IA_PAGES) {
    const url =
      "https://archive.org/advancedsearch.php" +
      `?q=${encodeURIComponent(q)}` +
      fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
      `&rows=${IA_ROWS}&page=${iaPage}&output=json` +
      `&sort[]=${encodeURIComponent(SORT)}`;

    let res: Response | null = null;
    const attempts = fastMode ? [5000] : [UPSTREAM_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS + 5000];
    for (const timeoutMs of attempts) {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), timeoutMs);
        res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (res.ok) break;
      } catch {
        // Retry once with a longer timeout.
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    if (!res) break;
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

  if (docs.length === 0 && !query && !fastMode) {
    // Emergency retry with a simpler query before using schedule fallback.
    // This keeps homepage/explore cards playable when the richer query returns
    // no docs due upstream query parsing or transient Archive behavior.
    try {
      const emergencyQ = "mediatype:(audio OR etree) AND identifier:(kglw*)";
      const emergencyUrl =
        "https://archive.org/advancedsearch.php" +
        `?q=${encodeURIComponent(emergencyQ)}` +
        fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
        `&rows=${IA_ROWS}&page=1&output=json` +
        `&sort[]=${encodeURIComponent(SORT)}`;
      const emergencyController = new AbortController();
      const emergencyTimeout = setTimeout(() => emergencyController.abort(), 10000);
      const emergencyRes = await fetch(emergencyUrl, {
        cache: "no-store",
        signal: emergencyController.signal,
      });
      clearTimeout(emergencyTimeout);
      if (emergencyRes.ok) {
        const emergencyData = (await emergencyRes.json()) as { response?: { docs?: IaDoc[] } };
        const emergencyDocs = Array.isArray(emergencyData?.response?.docs)
          ? emergencyData.response.docs
          : [];
        if (emergencyDocs.length > 0) docs = emergencyDocs;
      }
    } catch {
      // Fall through to schedule fallback below.
    }
  }

  if (docs.length === 0 && !query) {
    const fallbackRows = await fetchKglwFallbackShows();
    const fallbackShowsRaw: ShowListItem[] = fallbackRows
      .map((row) => {
        const showDate = String(row.showdate || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(showDate)) return null;
        const venueName = String(row.venuename || "").trim();
        const location = String(row.location || "").trim();
        const city = String(row.city || "").trim() || undefined;
        const country = location.split(",").map((v) => v.trim()).filter(Boolean).slice(-1)[0] || undefined;
        const title = venueName
          ? `King Gizzard & The Lizard Wizard Live at ${venueName} on ${showDate}`
          : `King Gizzard & The Lizard Wizard Live on ${showDate}`;
        const specialTag = specialTagFromShowTitle(String(row.showtitle || "")) || undefined;
        return {
          showKey: `${showDate}|${slugify(venueName || city || "unknown")}`,
          showDate,
          title,
          city,
          country,
          venueText: venueName || undefined,
          locationText: location || undefined,
          defaultId: "",
          sourcesCount: 0,
          artwork: "/api/default-artwork",
          continent: continentFromVenueCoverageTitle(venueName, location, title),
          plays: 0,
          specialTag,
        } as ShowListItem;
      })
      .filter(Boolean) as ShowListItem[];

    let fallbackShows = fallbackShowsRaw;
    if (yearFilters.length > 0) {
      const yearSet = new Set(yearFilters);
      fallbackShows = fallbackShows.filter((s) => yearSet.has(String(s.showDate).slice(0, 4)));
    }
    if (continentFilters.length > 0) {
      fallbackShows = fallbackShows.filter((s) => continentFilters.includes(s.continent));
    }
    fallbackShows = filterShowsByLocationAndVenue(
      fallbackShows,
      countryFilters,
      cityFilters,
      venueFilters,
    );
    fallbackShows = filterByShowTypes(fallbackShows, showTypes);
    fallbackShows = sortShows(fallbackShows, sort);

    const yearCounts = new Map<string, number>();
    const continentCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    const cityContextCounts = new Map<string, Map<string, number>>();
    const venueCounts = new Map<string, number>();
    const countriesByContinentCounts = new Map<string, Map<string, number>>();
    const citiesByCountryCounts = new Map<string, Map<string, number>>();
    const showTypeCounts = new Map<string, number>([
      ["Rave", 0],
      ["Acoustic", 0],
      ["Orchestra", 0],
      ["Standard", 0],
    ]);
    for (const s of fallbackShows) {
      const y = s.showDate?.slice(0, 4);
      if (y && /^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
      const c = s.continent;
      if (c) continentCounts.set(c, (continentCounts.get(c) || 0) + 1);
      const country = String(s.country || "").trim();
      if (country) {
        countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
        const continentKey = String(s.continent || "").trim();
        if (continentKey && continentKey !== "Unknown") {
          const byContinent = countriesByContinentCounts.get(continentKey) || new Map<string, number>();
          byContinent.set(country, (byContinent.get(country) || 0) + 1);
          countriesByContinentCounts.set(continentKey, byContinent);
        }
      }
      const city = String(s.city || "").trim();
      if (city) {
        cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
        const contextLabel = cityContextLabelForShow(s);
        const byContext = cityContextCounts.get(city) || new Map<string, number>();
        byContext.set(contextLabel, (byContext.get(contextLabel) || 0) + 1);
        cityContextCounts.set(city, byContext);
        if (country) {
          const byCountry = citiesByCountryCounts.get(country) || new Map<string, number>();
          byCountry.set(city, (byCountry.get(city) || 0) + 1);
          citiesByCountryCounts.set(country, byCountry);
        }
      }
      const venue = String(s.venueText || s.title || "").trim();
      if (venue) venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
      const label = showTypeLabelForShow(s);
      showTypeCounts.set(label, (showTypeCounts.get(label) || 0) + 1);
    }

    const start = (page - 1) * PAGE_SIZE;
    const items = fallbackShows.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < fallbackShows.length;
    const payload = {
      page,
      items,
      hasMore,
      venueTotal: fallbackShows.length,
      facets: {
        years: Array.from(yearCounts.entries())
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([value, count]) => ({ value, count })),
        continents: Array.from(continentCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        countries: Array.from(countryCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        cities: Array.from(cityCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        citiesMeta: Object.fromEntries(
          Array.from(cityContextCounts.entries()).map(([city, byContext]) => {
            const top = Array.from(byContext.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
            return [city, { context: top?.[0] || "" }];
          }),
        ),
        venues: Array.from(venueCounts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
        countriesByContinent: Object.fromEntries(
          Array.from(countriesByContinentCounts.entries()).map(([continent, byCountry]) => [
            continent,
            Array.from(byCountry.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([value, count]) => ({ value, count })),
          ]),
        ),
        citiesByCountry: Object.fromEntries(
          Array.from(citiesByCountryCounts.entries()).map(([country, byCity]) => [
            country,
            Array.from(byCity.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([value, count]) => ({ value, count })),
          ]),
        ),
        showTypes: Array.from(showTypeCounts.entries()).map(([value, count]) => ({ value, count })),
        albums: DISCOGRAPHY_ALBUM_TITLES.map((title) => ({ value: title, count: 0 })),
        albumShowKeys: {},
        albumUniverseCount: fallbackShows.length,
      },
      debug: {
        years: yearFilters.length > 0 ? yearFilters : ["All"],
        continents: continentFilters.length > 0 ? continentFilters : ["All"],
        countries: countryFilters.length > 0 ? countryFilters : ["All"],
        cities: cityFilters.length > 0 ? cityFilters : ["All"],
        venues: venueFilters.length > 0 ? venueFilters : ["All"],
        showTypes: showTypes.length > 0 ? showTypes : ["All"],
        albums: albumFilters.length > 0 ? albumFilters : ["All"],
        query,
        sort,
        fetchedDocs: 0,
        recordings: 0,
        uniqueShows: fallbackShows.length,
        searchedShows: fallbackShows.length,
        iaPagesUsed: iaPage,
        source: "kglw-fallback",
        unresolvedVenueCountryCount: fallbackShows.filter(
          (s) => !s.country && String(s.venueText || s.title || "").trim().length > 0,
        ).length,
        unresolvedVenueCountrySamples: Array.from(
          new Set(
            fallbackShows
              .filter((s) => !s.country)
              .map((s) => String(s.venueText || s.title || "").trim())
              .filter(Boolean),
          ),
        ).slice(0, 20),
      },
    };
    if (randomPickMode) {
      randomPickerUniverseCache.set(randomUniverseKey, {
        expiresAt: Date.now() + RANDOM_PICKER_UNIVERSE_CACHE_TTL_MS,
        shows: fallbackShows,
      });
      const chosen =
        fallbackShows[Math.floor(Math.random() * fallbackShows.length)] || null;
      return Response.json(
        {
          item: chosen,
          venueTotal: fallbackShows.length,
          debug: {
            years: yearFilters.length > 0 ? yearFilters : ["All"],
            continents: continentFilters.length > 0 ? continentFilters : ["All"],
            countries: countryFilters.length > 0 ? countryFilters : ["All"],
            cities: cityFilters.length > 0 ? cityFilters : ["All"],
            venues: venueFilters.length > 0 ? venueFilters : ["All"],
            showTypes: showTypes.length > 0 ? showTypes : ["All"],
            albums: albumFilters.length > 0 ? albumFilters : ["All"],
            query,
            sort,
            fetchedDocs: 0,
            recordings: 0,
            uniqueShows: fallbackShows.length,
            searchedShows: fallbackShows.length,
            iaPagesUsed: iaPage,
            source: "kglw-fallback-random",
            unresolvedVenueCountryCount: fallbackShows.filter(
              (s) => !s.country && String(s.venueText || s.title || "").trim().length > 0,
            ).length,
          },
        },
        { headers: SUCCESS_CACHE_HEADERS },
      );
    }
    showsResponseCache.set(cacheKey, {
      expiresAt: Date.now() + SHOWS_RESPONSE_CACHE_TTL_MS,
      payload,
    });
    if (
      page === 1 &&
      yearFilters.length === 0 &&
      continentFilters.length === 0 &&
      countryFilters.length === 0 &&
      cityFilters.length === 0 &&
      venueFilters.length === 0 &&
      showTypes.length === 0 &&
      sort === "newest"
    ) {
      lastGoodDefaultPayload = payload;
    }
    return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
  }

  const recordings = buildRecordingsFromDocs(docs, continentFilters);
  const shows = buildShowsFromRecordings(recordings);
  const kglwSpecialTagsByDate = await getKglwSpecialTagsByDate();
  const taggedShows = applySpecialTagsToShows(shows, kglwSpecialTagsByDate);
  const sortedShowsForQuery = sortShows(taggedShows.slice(), sort);

  const qLower = query.toLowerCase();
  let searchedShowsForFacets = query
    ? sortedShowsForQuery.filter((s) => {
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
        return queryMatchesByTokens(haystack, qLower);
      })
    : sortedShowsForQuery;
  const searchedShowsWithLocationFilters = filterShowsByLocationAndVenue(
    searchedShowsForFacets,
    countryFilters,
    cityFilters,
    venueFilters,
  );
  const searchedShowsWithoutAlbums = filterByShowTypes(
    searchedShowsWithLocationFilters,
    showTypes,
  );
  const showsForFacetCount = searchedShowsWithoutAlbums;
  const scopedUniverseKeys = new Set(showsForFacetCount.map((s) => s.showKey));
  const shouldComputeAlbumFacets = includeAlbumFacets || albumFilters.length > 0;
  const albumKeySets = shouldComputeAlbumFacets && DISCOGRAPHY_ALBUM_TITLES.length > 0
    ? await withConcurrency(
        DISCOGRAPHY_ALBUM_TITLES,
        3,
        async (albumTitle) => ({
          key: albumTitle.toLowerCase(),
          showKeys: await fetchAlbumMatchedShowKeys(albumTitle, continentFilters),
        }),
      )
    : [];
  const albumFacetCounts = new Map<string, number>();
  const albumFacetShowKeys: Record<string, string[]> = {};
  const albumSetMap = new Map<string, Set<string>>();
  for (const { key, showKeys } of albumKeySets) {
    albumSetMap.set(key, showKeys);
    const scoped: string[] = [];
    for (const showKey of showKeys) {
      if (!scopedUniverseKeys.has(showKey)) continue;
      scoped.push(showKey);
    }
    albumFacetShowKeys[key] = scoped;
    albumFacetCounts.set(key, scoped.length);
  }
  let searchedShows = searchedShowsWithoutAlbums;
  if (albumFilters.length > 0) {
    const selectedSets = albumFilters.map(
      (albumKey) => albumSetMap.get(albumKey) || new Set<string>(),
    );
    const intersection = new Set<string>(scopedUniverseKeys);
    for (const set of selectedSets) {
      for (const key of Array.from(intersection)) {
        if (!set.has(key)) intersection.delete(key);
      }
    }
    searchedShows = searchedShowsWithoutAlbums.filter((s) => intersection.has(s.showKey));
  }

  // Song/track matches come from Archive full-text indexing.
  // This catches shows where the query appears in tracklists/metadata even when
  // the venue/title itself does not contain the term.
  let songMatchedShows: ShowListItem[] = [];
  if (query && page === 1) {
    const songDocs: IaDoc[] = [];
    const songTerm = query.replace(/"/g, "").trim();
    const songTokenQuery = buildSongTokenQuery(songTerm);

    if (songTerm && songTokenQuery) {
      const SONG_ROWS = fastMode ? 200 : 500;
      const MAX_SONG_DOCS = fastMode ? 120 : 1000;
      const MAX_SONG_PAGES = Math.ceil(MAX_SONG_DOCS / SONG_ROWS);
      let songPage = 1;

      while (songPage <= MAX_SONG_PAGES) {
        const songQ = `${q} AND (${songTokenQuery})`;
        const songUrl =
          "https://archive.org/advancedsearch.php" +
          `?q=${encodeURIComponent(songQ)}` +
          fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
          `&rows=${SONG_ROWS}&page=${songPage}&output=json` +
          `&sort[]=${encodeURIComponent(SORT)}`;

        let songRes: Response | null = null;
        for (const timeoutMs of fastMode ? [4500] : [UPSTREAM_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS + 5000]) {
          let songTimeout: ReturnType<typeof setTimeout> | null = null;
          try {
            const controller = new AbortController();
            songTimeout = setTimeout(() => controller.abort(), timeoutMs);
            songRes = await fetch(songUrl, { cache: "no-store", signal: controller.signal });
            if (songRes.ok) break;
          } catch {
            // Retry once with a longer timeout.
          } finally {
            if (songTimeout) clearTimeout(songTimeout);
          }
        }
        if (!songRes) break;
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

      if (songDocs.length === 0) {
        // Fallback for multi-word queries: IA full-text can miss strict AND token matches.
        const looseQuery = buildSongTokenQueryLoose(songTerm);
        if (looseQuery) {
          const SONG_ROWS = fastMode ? 200 : 500;
          const MAX_SONG_DOCS = fastMode ? 120 : 1000;
          const MAX_SONG_PAGES = Math.ceil(MAX_SONG_DOCS / SONG_ROWS);
          let songPage = 1;
          while (songPage <= MAX_SONG_PAGES) {
            const songQ = `${q} AND (${looseQuery})`;
            const songUrl =
              "https://archive.org/advancedsearch.php" +
              `?q=${encodeURIComponent(songQ)}` +
              fields.map((f) => `&fl[]=${encodeURIComponent(f)}`).join("") +
              `&rows=${SONG_ROWS}&page=${songPage}&output=json` +
              `&sort[]=${encodeURIComponent(SORT)}`;

            let songRes: Response | null = null;
            for (const timeoutMs of fastMode ? [4500] : [UPSTREAM_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS + 5000]) {
              let songTimeout: ReturnType<typeof setTimeout> | null = null;
              try {
                const controller = new AbortController();
                songTimeout = setTimeout(() => controller.abort(), timeoutMs);
                songRes = await fetch(songUrl, { cache: "no-store", signal: controller.signal });
                if (songRes.ok) break;
              } catch {
                // Retry once with a longer timeout.
              } finally {
                if (songTimeout) clearTimeout(songTimeout);
              }
            }
            if (!songRes) break;
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
        }
      }

      const songRecordings = buildRecordingsFromDocs(songDocs, continentFilters);
      songMatchedShows = sortShows(
        filterByShowTypes(
          filterShowsByLocationAndVenue(
            applySpecialTagsToShows(
              buildShowsFromRecordings(songRecordings),
              kglwSpecialTagsByDate,
            ),
            countryFilters,
            cityFilters,
            venueFilters,
          ),
          showTypes,
        ),
        sort,
      );

      // Compute per-show longest matching track length for sort/filter UX.
      const MAX_SONG_LENGTH_LOOKUPS = fastMode ? 0 : 12;
      const target = songMatchedShows.slice(0, MAX_SONG_LENGTH_LOOKUPS);
      if (target.length > 0) {
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
  }

  if (query && songMatchedShows.length > 0) {
    const mergedByKey = new Map<string, ShowListItem>();
    for (const s of searchedShows) mergedByKey.set(s.showKey, s);
    for (const s of songMatchedShows) {
      if (!mergedByKey.has(s.showKey)) mergedByKey.set(s.showKey, s);
    }
    searchedShows = sortShows(Array.from(mergedByKey.values()), sort);
    searchedShowsForFacets = searchedShows;
  }
  if (randomPickMode) {
    randomPickerUniverseCache.set(randomUniverseKey, {
      expiresAt: Date.now() + RANDOM_PICKER_UNIVERSE_CACHE_TTL_MS,
      shows: searchedShows,
    });
    const chosen = searchedShows[Math.floor(Math.random() * searchedShows.length)] || null;
    return Response.json(
      {
        item: chosen,
        venueTotal: searchedShows.length,
        debug: {
          years: yearFilters.length > 0 ? yearFilters : ["All"],
          continents: continentFilters.length > 0 ? continentFilters : ["All"],
          countries: countryFilters.length > 0 ? countryFilters : ["All"],
          cities: cityFilters.length > 0 ? cityFilters : ["All"],
          venues: venueFilters.length > 0 ? venueFilters : ["All"],
          showTypes: showTypes.length > 0 ? showTypes : ["All"],
          albums: albumFilters.length > 0 ? albumFilters : ["All"],
          query,
          sort,
          fetchedDocs: docs.length,
          recordings: recordings.length,
          uniqueShows: shows.length,
          searchedShows: searchedShows.length,
          iaPagesUsed: iaPage,
          source: "ia-random",
        },
      },
      { headers: SUCCESS_CACHE_HEADERS },
    );
  }

  const yearCounts = new Map<string, number>();
  const continentCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const cityContextCounts = new Map<string, Map<string, number>>();
  const venueCounts = new Map<string, number>();
  const countriesByContinentCounts = new Map<string, Map<string, number>>();
  const citiesByCountryCounts = new Map<string, Map<string, number>>();
  for (const s of searchedShows) {
    const y = s.showDate?.slice(0, 4);
    if (y && /^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
    const c = s.continent;
    if (c) continentCounts.set(c, (continentCounts.get(c) || 0) + 1);
    const country = String(s.country || "").trim();
    if (country) {
      countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
      const continentKey = String(s.continent || "").trim();
      if (continentKey && continentKey !== "Unknown") {
        const byContinent = countriesByContinentCounts.get(continentKey) || new Map<string, number>();
        byContinent.set(country, (byContinent.get(country) || 0) + 1);
        countriesByContinentCounts.set(continentKey, byContinent);
      }
    }
    const city = String(s.city || "").trim();
    if (city) {
      cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
      const contextLabel = cityContextLabelForShow(s);
      const byContext = cityContextCounts.get(city) || new Map<string, number>();
      byContext.set(contextLabel, (byContext.get(contextLabel) || 0) + 1);
      cityContextCounts.set(city, byContext);
      if (country) {
        const byCountry = citiesByCountryCounts.get(country) || new Map<string, number>();
        byCountry.set(city, (byCountry.get(city) || 0) + 1);
        citiesByCountryCounts.set(country, byCountry);
      }
    }
    const venue = String(s.venueText || s.title || "").trim();
    if (venue) venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
  }
  const showTypeCounts = new Map<string, number>([
    ["Rave", 0],
    ["Acoustic", 0],
    ["Orchestra", 0],
    ["Standard", 0],
  ]);
  for (const s of searchedShowsForFacets) {
    const label = showTypeLabelForShow(s);
    showTypeCounts.set(label, (showTypeCounts.get(label) || 0) + 1);
  }

  const facets = {
    years: Array.from(yearCounts.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([value, count]) => ({ value, count })),
    continents: Array.from(continentCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    countries: Array.from(countryCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    cities: Array.from(cityCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    citiesMeta: Object.fromEntries(
      Array.from(cityContextCounts.entries()).map(([city, byContext]) => {
        const top = Array.from(byContext.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        return [city, { context: top?.[0] || "" }];
      }),
    ),
    venues: Array.from(venueCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count })),
    countriesByContinent: Object.fromEntries(
      Array.from(countriesByContinentCounts.entries()).map(([continent, byCountry]) => [
        continent,
        Array.from(byCountry.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
      ]),
    ),
    citiesByCountry: Object.fromEntries(
      Array.from(citiesByCountryCounts.entries()).map(([country, byCity]) => [
        country,
        Array.from(byCity.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count })),
      ]),
    ),
    showTypes: Array.from(showTypeCounts.entries()).map(([value, count]) => ({ value, count })),
    albums: DISCOGRAPHY_ALBUM_TITLES.map((title) => ({
      value: title,
      count: albumFacetCounts.get(title.toLowerCase()) || 0,
    })),
    albumShowKeys: albumFacetShowKeys,
    albumUniverseCount: showsForFacetCount.length,
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
      countries: countryFilters.length > 0 ? countryFilters : ["All"],
      cities: cityFilters.length > 0 ? cityFilters : ["All"],
      venues: venueFilters.length > 0 ? venueFilters : ["All"],
      showTypes: showTypes.length > 0 ? showTypes : ["All"],
      albums: albumFilters.length > 0 ? albumFilters : ["All"],
      query,
      sort,
      fetchedDocs: docs.length,
      recordings: recordings.length,
      uniqueShows: shows.length,
      searchedShows: searchedShows.length,
      iaPagesUsed: iaPage,
      unresolvedVenueCountryCount: searchedShows.filter(
        (s) => !s.country && String(s.venueText || s.title || "").trim().length > 0,
      ).length,
      unresolvedVenueCountrySamples: Array.from(
        new Set(
          searchedShows
            .filter((s) => !s.country)
            .map((s) => String(s.venueText || s.title || "").trim())
            .filter(Boolean),
        ),
      ).slice(0, 20),
    },
  };
  const isDefaultRootQuery =
    page === 1 &&
    !query &&
    yearFilters.length === 0 &&
    continentFilters.length === 0 &&
    countryFilters.length === 0 &&
    cityFilters.length === 0 &&
    venueFilters.length === 0 &&
    showTypes.length === 0 &&
    albumFilters.length === 0 &&
    sort === "newest";
  if (isDefaultRootQuery && Array.isArray(payload.items) && payload.items.length > 0) {
    lastGoodDefaultPayload = payload;
  }
  if (isDefaultRootQuery && payload.items.length === 0 && lastGoodDefaultPayload) {
    return Response.json(lastGoodDefaultPayload, { headers: SUCCESS_CACHE_HEADERS });
  }
  const shouldCacheQueryPayload =
    !query ||
    payload.items.length > 0 ||
    Number(payload.song?.total || 0) > 0;
  if (shouldCacheQueryPayload) {
    showsResponseCache.set(cacheKey, {
      expiresAt: Date.now() + SHOWS_RESPONSE_CACHE_TTL_MS,
      payload,
    });
  }
  return Response.json(payload, { headers: SUCCESS_CACHE_HEADERS });
}
