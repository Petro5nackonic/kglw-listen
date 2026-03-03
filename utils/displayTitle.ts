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
    // Some IA titles end with dangling "on" after date removal ("Live at ... on").
    .replace(/\bon\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripMediaExtensionNoise(cleaned) || "Untitled";
}

export function toDisplayTrackTitle(title?: string | null): string {
  const original = (title || "").trim();
  if (!original) return "";

  let cleaned = toDisplayTitle(original);

  // Some uploads include multiple show/set prefixes before a numbered song segment,
  // e.g. "Live in New York City '25 - Rock Night - 07 Sense".
  const segments = cleaned
    .split(/\s[-:|–—]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const numberedSegment = segments[i].match(/^(?:track\s*)?\d{1,2}\s+(.+)$/i);
    if (numberedSegment?.[1]) {
      cleaned = numberedSegment[1];
      break;
    }
  }

  cleaned = cleaned
    .replace(/\s*[-:|–—]\s*live at .+$/i, "")
    .replace(/\s*[-:|–—]\s*live in .+$/i, "")
    .replace(/\s*\(live at[^)]*\)/gi, "")
    .replace(/\s*\(live in[^)]*\)/gi, "")
    // Keep only the song portion when a live/location suffix trails in parens.
    .replace(/\s*\((?:from\s+)?live[^)]*\)\s*$/i, "")
    .replace(LEADING_TRACK_NUM_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripMediaExtensionNoise(cleaned) || "Untitled";
}
