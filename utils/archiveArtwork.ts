const PLACEHOLDER_IDENTIFIER_BLOCKLIST = new Set([
  "kglw2024-09-14.sbd",
  "king-gizzard-the-lizard-wizard-live-in-chicago-24-27-set-live-in-chicago-24",
]);

export function archiveIdentifierFromArtworkUrl(url?: string): string {
  if (!url) return "";
  const cleaned = String(url).trim();
  if (!cleaned) return "";
  const withoutQuery = cleaned.split("?")[0] || "";
  const raw = withoutQuery.split("/").pop() || "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function shouldUseDefaultArtwork(identifierOrUrl?: string): boolean {
  const raw = String(identifierOrUrl || "").trim();
  if (!raw) return true;
  const identifier = raw.includes("/")
    ? archiveIdentifierFromArtworkUrl(raw)
    : raw;
  if (!identifier) return true;
  const normalized = identifier.toLowerCase();
  if (PLACEHOLDER_IDENTIFIER_BLOCKLIST.has(normalized)) return true;
  if (normalized.includes("set-live-in-")) return true;
  return false;
}
