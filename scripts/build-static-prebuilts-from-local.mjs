import { copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const ALLOW_UNSTABLE = args.includes("--allowUnstable");
const APPLY = args.includes("--apply");
const USE_LEGACY = args.includes("--legacyDefs");
const SKIP_VALIDATION = args.includes("--skipValidation");
const versionsArg = args.find((arg) => arg.startsWith("--versionsPerTrack="));
const originArg = args.find((arg) => arg.startsWith("--origin="));
const maxAlbumsArg = args.find((arg) => arg.startsWith("--maxAlbums="));
const maxTracksArg = args.find((arg) => arg.startsWith("--maxTracksPerAlbum="));
const outArg = args.find((arg) => arg.startsWith("--out="));
const backupArg = args.find((arg) => arg.startsWith("--backupPath="));
const parsedVersions = Number(String(versionsArg || "").split("=")[1] || "4");
const VERSIONS_PER_TRACK = Math.min(6, Math.max(2, Number.isFinite(parsedVersions) ? parsedVersions : 4));
const MAX_ALBUMS = Math.max(0, Number(String(maxAlbumsArg || "").split("=")[1] || "0"));
const MAX_TRACKS_PER_ALBUM = Math.max(
  0,
  Number(String(maxTracksArg || "").split("=")[1] || "0"),
);
const ORIGIN = String(originArg || "").startsWith("--origin=")
  ? String(originArg).slice("--origin=".length)
  : process.env.KGLW_ORIGIN || "http://localhost:3000";
const OUTPUT_PATH = resolve(
  String(outArg || "").startsWith("--out=")
    ? String(outArg).slice("--out=".length)
    : "data/prebuilt-playlists.generated.json",
);
const STATIC_MANIFEST_PATH = resolve("data", "prebuilt-playlists.static.json");
const BACKUP_PATH = resolve(
  String(backupArg || "").startsWith("--backupPath=")
    ? String(backupArg).slice("--backupPath=".length)
    : "data/prebuilt-playlists.static.backup.json",
);
const KGLW_API_ROOT = "https://kglw.net/api/v2";
const STUDIO_ALBUM_ALLOWLIST = [
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

const LEGACY_PREBUILT_DEFS = [
  {
    name: "Flight B741 Live Comp.",
    tracks: [
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
  },
  {
    name: "I'm In Your Mind Fuzz Live Comp.",
    tracks: [
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
    chainFirstCount: 4,
  },
  {
    name: "Infest the Rats' Nest",
    tracks: [
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
  },
  {
    name: "Nonagon Infinity",
    tracks: [
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
  },
  {
    name: "PetroDragonic Apocalypse",
    tracks: [
      "Motor Spirit",
      "Supercell",
      "Converge",
      "Witchcraft",
      "Gila Monster",
      "Dragon",
      "Flamethrower",
    ],
  },
  {
    name: "The Silver Chord",
    tracks: ["Theia", "The Silver Cord", "Set", "Chang'e", "Gilgamesh", "Swan Song", "Extinction"],
  },
];
const CHAIN_FIRST_COUNT_BY_ALBUM = new Map([
  ["i'm in your mind fuzz", 4],
  ["nonagon infinity", 4],
]);

const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const compact = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(haystack, token) {
  if (!haystack || !token) return false;
  const re = new RegExp(`(^|\\s)${escapeRegex(token)}(\\s|$)`, "i");
  return re.test(haystack);
}

function getSongTokens(songName) {
  return normalize(songName)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !NOISE_WORDS.has(token));
}

function getSongMatchStats(songName, haystackText) {
  const needle = normalize(songName);
  const hay = normalize(haystackText);
  const needleCompact = compact(songName);
  const hayCompact = compact(haystackText);
  const tokens = getSongTokens(songName);
  const tokenHits = tokens.reduce((sum, token) => (hasWord(hay, token) ? sum + 1 : sum), 0);
  const phraseMatch = Boolean(needle) && hay.includes(needle);
  const compactMatch = needleCompact.length >= 4 && hayCompact.includes(needleCompact);
  const hitRatio = tokens.length > 0 ? tokenHits / tokens.length : 0;
  const strong =
    phraseMatch ||
    compactMatch ||
    (tokens.length === 1 ? tokenHits === 1 : tokenHits >= Math.max(2, Math.ceil(tokens.length * 0.67)));
  return { strong, tokenHits, hitRatio, phraseMatch, compactMatch };
}
const STUDIO_ALBUM_ALLOWLIST_SET = new Set(STUDIO_ALBUM_ALLOWLIST.map((name) => normalize(name)));

const identifierCache = new Map();

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: null, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeOrdered(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const v = String(value || "").trim();
    if (!v) continue;
    const key = normalize(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

async function fetchStudioAlbumDefs() {
  const url =
    `${KGLW_API_ROOT}/albums.json` +
    "?artist_id=1&order_by=releasedate&direction=asc&limit=3000";
  const res = await fetchJson(url, 20000);
  if (!res.ok || !res.data || res.data.error) return [];

  const rows = Array.isArray(res.data.data) ? res.data.data : [];
  const byAlbum = new Map();

  for (const row of rows) {
    if (Number(row?.artist_id ?? 0) !== 1) continue;
    if (Number(row?.islive ?? 0) !== 0) continue;

    const albumName = String(row?.album_title || "").trim();
    const songName = String(row?.song_name || "").trim();
    if (!albumName || !songName) continue;

    const key = normalize(albumName);
    const existing = byAlbum.get(key) || {
      name: albumName,
      tracks: [],
      releasedate: String(row?.releasedate || ""),
    };
    existing.tracks.push({
      title: songName,
      position: Number(row?.position ?? Number.MAX_SAFE_INTEGER),
    });
    if (!existing.releasedate) existing.releasedate = String(row?.releasedate || "");
    byAlbum.set(key, existing);
  }

  const defs = Array.from(byAlbum.values())
    .map((entry) => {
      const ordered = entry.tracks
        .slice()
        .sort((a, b) => {
          const pa = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
          const pb = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          return String(a.title).localeCompare(String(b.title));
        })
        .map((t) => t.title);
      const deduped = dedupeOrdered(ordered);
      return {
        name: entry.name,
        tracks: deduped,
        chainFirstCount: CHAIN_FIRST_COUNT_BY_ALBUM.get(normalize(entry.name)),
        releasedate: entry.releasedate,
      };
    })
    .filter(
      (entry) =>
        entry.tracks.length > 0 && STUDIO_ALBUM_ALLOWLIST_SET.has(normalize(entry.name)),
    )
    .sort((a, b) => String(a.releasedate || "").localeCompare(String(b.releasedate || "")));

  if (MAX_ALBUMS > 0) return defs.slice(0, MAX_ALBUMS);
  return defs;
}

function buildDownloadUrl(identifier, fileName) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`;
}

function isTrackNumberStyle(name) {
  const base = String(name || "").toLowerCase().split("/").pop() || "";
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  // Accept compact track-number identifiers only (e.g. t12, 08, xxx.t03).
  // Reject descriptive names like "16-I'm In Your Mind..." or "08-Ontology".
  return /(?:^|[._-])t?\d{1,3}[a-z]?$/.test(noExt);
}

function classifyValidationStatus(status) {
  if (status === 200 || status === 206) return "ok";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "restricted";
  if (status === 503) return "unstable";
  return "error";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  const amount = Math.floor(ms * 0.2);
  const delta = Math.floor(Math.random() * (amount * 2 + 1)) - amount;
  return Math.max(0, ms + delta);
}

async function validateRangeGet(url) {
  const backoffs = [250, 750, 2000, 5000];
  for (let attempt = 0; attempt <= backoffs.length; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        cache: "no-store",
      });
      const kind = classifyValidationStatus(res.status);
      if (kind === "ok") return { ok: true, status: res.status, kind };
      if (kind === "unstable" && attempt < backoffs.length) {
        await sleep(jitter(backoffs[attempt]));
        continue;
      }
      return { ok: false, status: res.status, kind };
    } catch {
      if (attempt < backoffs.length) {
        await sleep(jitter(backoffs[attempt]));
        continue;
      }
      return { ok: false, status: null, kind: "error" };
    }
  }
  return { ok: false, status: null, kind: "error" };
}

function buildMp3Candidates(identifier, files) {
  return (Array.isArray(files) ? files : [])
    .filter((f) => {
      const name = String(f?.name || "").trim();
      const format = String(f?.format || "");
      return Boolean(name) && format.toLowerCase().includes("mp3");
    })
    .map((f) => {
      const fileName = String(f?.name || "").trim();
      const title = String(f?.title || "").trim();
      const track = String(f?.track || "").trim();
      const hasTrackMapping = Boolean(title || track);
      return {
        identifier,
        fileName,
        title: title || undefined,
        hasTrackMapping,
        isTrackNumberStyle: isTrackNumberStyle(fileName),
        url: buildDownloadUrl(identifier, fileName),
      };
    });
}

function scoreCandidate(songName, candidate) {
  const fileStats = getSongMatchStats(songName, candidate.fileName || "");
  const titleStats = getSongMatchStats(songName, candidate.title || "");
  const songTokens = getSongTokens(songName);
  // For short/ambiguous song names (single non-noise token like "Set", "Empty",
  // "Hell", "Dragon"), token-hit heuristics produce false positives. Require
  // a phrase or compact match in that case on either the filename or the title.
  const filenameRealMatch =
    fileStats.phraseMatch ||
    fileStats.compactMatch ||
    (songTokens.length >= 2 && fileStats.strong);
  const titleRealMatch =
    titleStats.phraseMatch ||
    titleStats.compactMatch ||
    (songTokens.length >= 2 && titleStats.strong);
  const allowTitleOnly =
    candidate.isTrackNumberStyle && candidate.hasTrackMapping && titleRealMatch;
  if (!filenameRealMatch && !allowTitleOnly) return Number.NEGATIVE_INFINITY;
  let score = fileStats.tokenHits * 14;
  if (fileStats.phraseMatch) score += 34;
  if (fileStats.compactMatch) score += 14;
  score += Math.round(fileStats.hitRatio * 12);
  if (allowTitleOnly) {
    score += titleStats.tokenHits * 4;
    if (titleStats.phraseMatch) score += 10;
    if (titleStats.compactMatch) score += 6;
  }
  const fileNorm = normalize(candidate.fileName);
  const titleNorm = normalize(candidate.title || "");
  if (songTokens.length > 0 && songTokens.every((t) => fileNorm.includes(t))) score += 40;
  if (songTokens.length > 0 && songTokens.every((t) => titleNorm.includes(t))) score += 20;
  if (candidate.isTrackNumberStyle && !candidate.hasTrackMapping) score -= 25;
  else if (candidate.isTrackNumberStyle) score -= 5;
  return score;
}

async function resolveIdentifierCandidates(identifier, songName) {
  const id = String(identifier || "").trim();
  if (!id) return [];
  const cached = identifierCache.get(id);
  if (cached?.stability === "restricted") return [];
  if (cached?.stability === "unstable" && !ALLOW_UNSTABLE) return [];
  if (Array.isArray(cached?.candidates) && cached.candidates.length > 0) {
    return cached.candidates;
  }

  const metaRes = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(id)}`, 12000);
  if (!metaRes.ok) {
    if (metaRes.status === 401 || metaRes.status === 403) {
      identifierCache.set(id, { stability: "restricted", candidates: [] });
      return [];
    }
    if (metaRes.status === 503) {
      identifierCache.set(id, { stability: "unstable", candidates: [] });
      return [];
    }
    return [];
  }

  const rawCandidates = buildMp3Candidates(id, metaRes.data?.files || [])
    .map((candidate) => ({ candidate, score: scoreCandidate(songName, candidate) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);

  if (SKIP_VALIDATION) {
    const quick = rawCandidates.slice(0, Math.max(1, VERSIONS_PER_TRACK));
    identifierCache.set(id, { stability: "good", candidates: quick });
    return quick;
  }

  const validated = [];
  let sawUnstable = false;
  for (const candidate of rawCandidates) {
    const check = await validateRangeGet(candidate.url);
    if (check.ok) {
      validated.push(candidate);
      continue;
    }
    if (check.kind === "restricted") {
      identifierCache.set(id, { stability: "restricted", candidates: [] });
      return [];
    }
    if (check.kind === "unstable") sawUnstable = true;
  }

  const stability = sawUnstable && validated.length === 0 ? "unstable" : "good";
  const usable = stability === "unstable" && !ALLOW_UNSTABLE ? [] : validated;
  identifierCache.set(id, { stability, candidates: usable });
  return usable;
}

function toTrack(songName, item, candidate) {
  return {
    title: songName,
    url: candidate.url,
    length: undefined,
    track: "1",
    showKey: String(item?.showKey || "").trim() || undefined,
    showDate: String(item?.showDate || "").trim() || undefined,
    venueText: String(item?.title || "").trim() || undefined,
    artwork: String(item?.artwork || "").trim() || undefined,
  };
}

async function resolveVariants(songName) {
  const showsRes = await fetchJson(
    `${ORIGIN}/api/ia/shows?page=1&sort=most_played&fast=1&query=${encodeURIComponent(songName)}`,
    15000,
  );
  if (!showsRes.ok) return [];
  const items = Array.isArray(showsRes.data?.song?.items) ? showsRes.data.song.items : [];
  const selected = [];
  const seenIdentifiers = new Set();
  for (const item of items) {
    const id = String(item?.defaultId || "").trim();
    if (!id || seenIdentifiers.has(id)) continue;
    const candidates = await resolveIdentifierCandidates(id, songName);
    if (candidates.length === 0) continue;
    const best = candidates[0];
    selected.push(toTrack(songName, item, best));
    seenIdentifiers.add(id);
    if (selected.length >= VERSIONS_PER_TRACK) break;
  }
  return selected;
}

async function main() {
  console.log(
    `generator settings => origin=${ORIGIN} versionsPerTrack=${VERSIONS_PER_TRACK} allowUnstable=${ALLOW_UNSTABLE} apply=${APPLY} legacyDefs=${USE_LEGACY} skipValidation=${SKIP_VALIDATION}`,
  );

  const studioDefs = USE_LEGACY ? [] : await fetchStudioAlbumDefs();
  const prebuiltDefs = studioDefs.length > 0 ? studioDefs : LEGACY_PREBUILT_DEFS;
  if (studioDefs.length === 0 && !USE_LEGACY) {
    console.warn("Studio album fetch failed, falling back to legacy defs.");
  }
  console.log(`building ${prebuiltDefs.length} playlist definitions`);

  const unresolvedTracks = [];
  const playlists = [];
  for (const def of prebuiltDefs) {
    const slots = [];
    const trackList =
      MAX_TRACKS_PER_ALBUM > 0 ? def.tracks.slice(0, MAX_TRACKS_PER_ALBUM) : def.tracks.slice();
    for (let i = 0; i < trackList.length; i += 1) {
      const songName = trackList[i];
      const variants = await resolveVariants(songName);
      if (variants.length === 0) {
        unresolvedTracks.push({ album: def.name, track: songName });
        continue;
      }
      slots.push({
        canonicalTitle: normalize(songName),
        variants,
        chainGroup: def.chainFirstCount && i < def.chainFirstCount ? "intro" : undefined,
        chainOrder: def.chainFirstCount && i < def.chainFirstCount ? i + 1 : undefined,
      });
      console.log(`resolved ${def.name} -> ${songName} (${variants.length} versions)`);
    }
    if (slots.length > 0) {
      playlists.push({
        name: def.name,
        prebuiltKind: "album-live-comp",
        slots,
      });
    }
  }

  const out = {
    generatedAt: Date.now(),
    playlists,
    source: studioDefs.length > 0 ? "studio-discography" : "legacy-fallback",
    buildMeta: {
      apply: APPLY,
      albumCount: prebuiltDefs.length,
      unresolvedTrackCount: unresolvedTracks.length,
      unresolvedTracks: unresolvedTracks.slice(0, 500),
    },
    identifierCache: Array.from(identifierCache.entries()).map(([identifier, value]) => ({
      identifier,
      stability: value?.stability || "good",
    })),
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log(`wrote ${OUTPUT_PATH} with ${playlists.length} playlists`);

  if (APPLY) {
    try {
      await copyFile(STATIC_MANIFEST_PATH, BACKUP_PATH);
      console.log(`backed up current static manifest to ${BACKUP_PATH}`);
    } catch {
      console.warn("No existing static manifest backup created (source missing or unreadable).");
    }
    await writeFile(STATIC_MANIFEST_PATH, JSON.stringify(out, null, 2), "utf8");
    console.log(`applied generated manifest to ${STATIC_MANIFEST_PATH}`);
  } else {
    console.log("preview mode only: static manifest was not modified (use --apply to promote).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

