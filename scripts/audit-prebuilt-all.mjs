import { readFile } from "node:fs/promises";

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
  return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  const suspiciousList = [];
  for (const playlist of data.playlists || []) {
    let totalVariants = 0;
    let suspicious = 0;
    let slotsWithoutFilenameMatch = 0;
    for (const slot of playlist.slots || []) {
      let slotHasFilenameMatch = false;
      for (const variant of slot.variants || []) {
        totalVariants += 1;
        const songName = variant.title || slot.canonicalTitle || "";
        const filenameMatch = strongFilenameSongMatch(songName, variant.url);
        const trackNumberStyle = isCompactTrackNumberName(variant.url);
        if (filenameMatch) slotHasFilenameMatch = true;
        const ok = filenameMatch || trackNumberStyle;
        if (!ok) {
          suspicious += 1;
          suspiciousList.push({
            album: playlist.name,
            song: songName,
            url: variant.url,
            showDate: variant.showDate,
            venueText: variant.venueText,
          });
        }
      }
      if ((slot.variants || []).length > 0 && !slotHasFilenameMatch) {
        slotsWithoutFilenameMatch += 1;
      }
    }
    rows.push({
      album: playlist.name,
      slots: (playlist.slots || []).length,
      totalVariants,
      suspiciousVariants: suspicious,
      slotsWhereEveryVariantReliesOnMetadataOnly: slotsWithoutFilenameMatch,
    });
  }
  console.log("Summary per playlist:");
  console.table(rows);
  console.log("\nTotal suspicious variants:", suspiciousList.length);
  if (suspiciousList.length > 0) {
    console.log("First 30 suspicious entries:");
    for (const entry of suspiciousList.slice(0, 30)) {
      console.log(
        `  [${entry.album}] "${entry.song}" (${entry.showDate || "?"} ${entry.venueText || ""})`,
      );
      console.log(`    -> ${entry.url}`);
    }
    // Non-zero exit so CI / npm scripts gate on mismatches.
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
