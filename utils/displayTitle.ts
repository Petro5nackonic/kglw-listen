const KGLW_ANYWHERE_RE =
  /\bking gizzard(?:\s*&\s*|\s+and\s+)the lizard wizard\b/gi;
const DATE_YMD_RE = /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g;
const DATE_DMY_RE = /\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b/g;
const LEADING_TRACK_NUM_RE = /^\s*(?:track\s*)?\d{1,2}(?:\s*[.)-]\s*|\s+)/i;
const MEDIA_EXT_RE =
  /\.((?:mp3|flac|ogg|m4a|wav|aac|alac|aiff|wma)(?:\.)?)$/i;

function stripMediaExtensionNoise(input: string): string {
  return input
    .replace(MEDIA_EXT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function toDisplayTitle(title?: string | null): string {
  const original = (title || "").trim();
  if (!original) return "";

  const cleaned = original
    .replace(KGLW_ANYWHERE_RE, " ")
    .replace(DATE_YMD_RE, " ")
    .replace(DATE_DMY_RE, " ")
    .replace(/\s*[-:|–—]+\s*/g, " - ")
    .replace(/(?:\s-\s){2,}/g, " - ")
    .replace(/^\s*-\s*|\s*-\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripMediaExtensionNoise(cleaned) || "Untitled";
}

export function toDisplayTrackTitle(title?: string | null): string {
  const original = (title || "").trim();
  if (!original) return "";

  let cleaned = toDisplayTitle(original);

  // Some uploads include the full show/venue prefix in track titles:
  // "Live at <venue/date> - 08 Road Train". Keep only the song part.
  if (/\blive at\b/i.test(cleaned)) {
    const tail = cleaned.match(/.*\s[-:|–—]\s(?:\d{1,2}\s+)?(.+)$/i);
    if (tail?.[1]) cleaned = tail[1];
  }

  cleaned = cleaned
    .replace(/\s*[-:|–—]\s*live at .+$/i, "")
    .replace(/\s*\(live at[^)]*\)/gi, "")
    .replace(LEADING_TRACK_NUM_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripMediaExtensionNoise(cleaned) || "Untitled";
}
