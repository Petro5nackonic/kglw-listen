import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputArg = process.argv.find((arg) => arg.startsWith("--in="));
const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const INPUT_PATH = resolve(
  inputArg ? inputArg.slice("--in=".length) : "data/prebuilt-playlists.static.json",
);
const OUTPUT_PATH = resolve(
  outputArg ? outputArg.slice("--out=".length) : inputArg ? inputArg.slice("--in=".length) : "data/prebuilt-playlists.static.json",
);

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
  if (!haystack || !token) return false;
  return new RegExp(`(^|\\s)${escapeRegex(token)}(\\s|$)`, "i").test(haystack);
}

function isCompactTrackNumberName(nameOrUrl) {
  const raw = String(nameOrUrl || "");
  const base = raw.split("/").pop() || raw;
  const decoded = decodeURIComponent(base).toLowerCase();
  const noExt = decoded.replace(/\.[a-z0-9]+$/i, "");
  return /(?:^|[._-])t?\d{1,3}[a-z]?$/.test(noExt);
}

function filenameStrongMatch(songName, url) {
  const file = decodeURIComponent(String(url || "").split("/").pop() || "");
  const fileNorm = normalize(file);
  const songNorm = normalize(songName);
  const songCompact = compact(songName);
  const fileCompact = compact(file);
  if (!songNorm || !fileNorm) return false;
  if (fileNorm.includes(songNorm)) return true;
  if (songCompact.length >= 4 && fileCompact.includes(songCompact)) return true;
  const tokens = songNorm
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !NOISE_WORDS.has(token));
  if (tokens.length === 0) return false;
  const hits = tokens.reduce((sum, token) => (hasWord(fileNorm, token) ? sum + 1 : sum), 0);
  if (tokens.length === 1) return hits === 1;
  return hits >= Math.max(2, Math.ceil(tokens.length * 0.67));
}

function shouldKeepVariant(songName, variantUrl) {
  if (filenameStrongMatch(songName, variantUrl)) return true;
  // Keep compact track-number files because they often require title metadata to identify.
  return isCompactTrackNumberName(variantUrl);
}

async function main() {
  const raw = await readFile(INPUT_PATH, "utf8");
  const data = JSON.parse(raw);
  const playlists = Array.isArray(data?.playlists) ? data.playlists : [];

  let removed = 0;
  let removedSlots = 0;
  for (const playlist of playlists) {
    const slots = Array.isArray(playlist?.slots) ? playlist.slots : [];
    for (const slot of slots) {
      const variants = Array.isArray(slot?.variants) ? slot.variants : [];
      const before = variants.length;
      slot.variants = variants.filter((variant) =>
        shouldKeepVariant(String(variant?.title || slot?.canonicalTitle || ""), String(variant?.url || "")),
      );
      removed += Math.max(0, before - slot.variants.length);
    }
    const beforeSlots = slots.length;
    playlist.slots = slots.filter((slot) => Array.isArray(slot?.variants) && slot.variants.length > 0);
    removedSlots += Math.max(0, beforeSlots - playlist.slots.length);
  }

  data.generatedAt = Date.now();
  data.sanitizedAt = Date.now();
  data.sanitizerMeta = {
    removedVariantCount: removed,
    removedSlotCount: removedSlots,
    source: "filename-title consistency filter",
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf8");
  console.log(`sanitized manifest: removed ${removed} variants, ${removedSlots} slots`);
  console.log(`wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
