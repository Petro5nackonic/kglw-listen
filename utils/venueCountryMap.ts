export function normalizeVenueKey(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VENUE_COUNTRY_OVERRIDES: Record<string, string> = {
  "red rocks amphitheatre": "United States",
  "forest hills tennis stadium": "United States",
  "the gorge amphitheatre": "United States",
  "hollywood bowl": "United States",
  "greek theatre": "United States",
  "the caverns": "United States",
  "salt shed": "United States",
  "aragon ballroom": "United States",
  "mission ballroom": "United States",
  "anthem washington dc": "United States",
  "rrr red rocks": "United States",
  "alexandra palace": "United Kingdom",
  "ally pally": "United Kingdom",
  "troxy": "United Kingdom",
  brixton: "United Kingdom",
  "o2 academy": "United Kingdom",
  "l olympia": "France",
  olympia: "France",
  "zaal paradiso": "Netherlands",
  paradiso: "Netherlands",
  "carlswerk victoria": "Germany",
  "tempodrom": "Germany",
  "zenith munich": "Germany",
  "afas live": "Netherlands",
  "fabrique milano": "Italy",
  "palau sant jordi": "Spain",
  "campo pequeno": "Portugal",
  "hordern pavilion": "Australia",
  "sidney myer music bowl": "Australia",
  "riverstage brisbane": "Australia",
  "forum melbourne": "Australia",
  "palace foreshore": "Australia",
  "enmore theatre": "Australia",
  "spark arena": "New Zealand",
  "powerstation auckland": "New Zealand",
  "tsutaya o east": "Japan",
  "zepp shinjuku": "Japan",
};

export function inferCountryFromVenueName(input: string): string | undefined {
  const normalized = normalizeVenueKey(input);
  if (!normalized) return undefined;
  if (VENUE_COUNTRY_OVERRIDES[normalized]) return VENUE_COUNTRY_OVERRIDES[normalized];

  for (const [key, country] of Object.entries(VENUE_COUNTRY_OVERRIDES)) {
    if (normalized.includes(key) || key.includes(normalized)) return country;
  }
  return undefined;
}

