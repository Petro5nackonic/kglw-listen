import { readFile } from "node:fs/promises";

const TARGET_ALBUMS = new Set(["L.W.", "K.G.", "Nonagon Infinity"]);
const NOISE_WORDS = new Set([
  "live",
  "version",
  "edit",
  "take",
  "intro",
  "outro",
  "part",
  "pt",
  "feat",
  "the",
  "and",
]);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(haystack, token) {
  return new RegExp(`(^|\\s)${escapeRegex(token)}(\\s|$)`, "i").test(haystack);
}

function isCompactTrackNumberName(nameOrUrl) {
  const raw = String(nameOrUrl || "");
  const base = raw.split("/").pop() || raw;
  const decoded = decodeURIComponent(base).toLowerCase();
  const noExt = decoded.replace(/\.[a-z0-9]+$/i, "");
  return /(?:^|[._-])t?\d{1,3}[a-z]?$/.test(noExt);
}

function strongFilenameSongMatch(songName, url) {
  const file = decodeURIComponent(String(url || "").split("/").pop() || "");
  const fileNorm = normalize(file);
  const songNorm = normalize(songName);
  const fileCompact = compact(file);
  const songCompact = compact(songName);
  if (!songNorm || !fileNorm) return false;
  if (fileNorm.includes(songNorm)) return true;
  if (songCompact.length >= 4 && fileCompact.includes(songCompact)) return true;
  const tokens = songNorm
    .split(" ")
    .filter((t) => t.length >= 2 && !NOISE_WORDS.has(t));
  if (tokens.length === 0) return false;
  const hits = tokens.reduce((sum, t) => (hasWord(fileNorm, t) ? sum + 1 : sum), 0);
  if (tokens.length === 1) return hits === 1;
  return hits >= Math.max(2, Math.ceil(tokens.length * 0.67));
}

async function main() {
  const raw = await readFile("data/prebuilt-playlists.static.json", "utf8");
  const data = JSON.parse(raw);
  const rows = [];
  for (const playlist of data.playlists || []) {
    if (!TARGET_ALBUMS.has(playlist.name)) continue;
    let totalVariants = 0;
    let suspicious = 0;
    for (const slot of playlist.slots || []) {
      for (const variant of slot.variants || []) {
        totalVariants += 1;
        const ok =
          strongFilenameSongMatch(variant.title || slot.canonicalTitle, variant.url) ||
          isCompactTrackNumberName(variant.url);
        if (!ok) suspicious += 1;
      }
    }
    rows.push({
      album: playlist.name,
      slots: (playlist.slots || []).length,
      totalVariants,
      suspicious,
    });
  }
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
