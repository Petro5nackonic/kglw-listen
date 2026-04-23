import { inferCountryFromVenueName } from "@/utils/venueCountryMap";

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

type Continent =
  | "North America"
  | "South America"
  | "Europe"
  | "Asia"
  | "Africa"
  | "Oceania"
  | "Unknown";

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
  if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel")) {
    return 12;
  }
  return 5;
}

function parseTrackNum(t?: string): number {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

export type {
  IaDoc,
  IaMetadataFile,
  Recording,
  ShowListItem,
  SpecialTag,
  ShowTypeFilter,
  KglwShowRow,
  KglwShowsResponse,
  KglwTagEntry,
  Continent,
};

export {
  DISCOGRAPHY_ALBUM_TITLES,
  DISCOGRAPHY_ALBUMS_BY_KEY,
  DISCOGRAPHY_ALBUM_TRACK_FALLBACKS,
  isKglwDoc,
  parseNum,
  sourceHint,
  scoreSource,
  slugify,
  specialTagFromShowTitle,
  venueSlugMatches,
  normalizeFilterValue,
  filterShowsByLocationAndVenue,
  filterByShowTypes,
  toShowTypeFilter,
  showTypeLabelForShow,
  continentFromVenueCoverageTitle,
  cityContextLabelForShow,
  buildRecordingsFromDocs,
  buildShowsFromRecordings,
  sortShows,
  tokenizeSearchInput,
  buildSongTokenQuery,
  buildSongTokenQueryLoose,
  tokenPrefixMatch,
  queryMatchesByTokens,
  parseLengthToSeconds,
  isAudioName,
  audioExtRank,
  trackSetRank,
  parseTrackNum,
  matchesAnyFilter,
  applySpecialTagsToShows,
};
