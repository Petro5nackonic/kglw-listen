import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const ALLOW_UNSTABLE = args.includes("--allowUnstable");
const versionsArg = args.find((arg) => arg.startsWith("--versionsPerTrack="));
const originArg = args.find((arg) => arg.startsWith("--origin="));
const parsedVersions = Number(String(versionsArg || "").split("=")[1] || "4");
const VERSIONS_PER_TRACK = Math.min(6, Math.max(2, Number.isFinite(parsedVersions) ? parsedVersions : 4));
const ORIGIN = String(originArg || "").startsWith("--origin=")
  ? String(originArg).slice("--origin=".length)
  : process.env.KGLW_ORIGIN || "http://localhost:3000";

const PREBUILT_DEFS = [
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
    name: "Petrodragonic Apocalypse",
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

const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

function buildDownloadUrl(identifier, fileName) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`;
}

function isTrackNumberStyle(name) {
  const base = String(name || "").toLowerCase().split("/").pop() || "";
  return /\bt\d{1,3}\b/.test(base) || /\b\d{1,3}\b/.test(base.replace(/\.[a-z0-9]+$/i, ""));
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
  const tokens = normalize(songName).split(" ").filter((part) => part.length >= 2);
  const hay = normalize(`${candidate.fileName} ${candidate.title || ""}`);
  let hits = 0;
  for (const t of tokens) if (hay.includes(t)) hits += 1;
  let score = hits * 10;
  const fileNorm = normalize(candidate.fileName);
  const titleNorm = normalize(candidate.title || "");
  if (tokens.length > 0 && tokens.every((t) => fileNorm.includes(t))) score += 40;
  if (tokens.length > 0 && tokens.every((t) => titleNorm.includes(t))) score += 20;
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
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);

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
    `${ORIGIN}/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`,
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
    `aggregator settings => origin=${ORIGIN} versionsPerTrack=${VERSIONS_PER_TRACK} allowUnstable=${ALLOW_UNSTABLE}`,
  );

  const playlists = [];
  for (const def of PREBUILT_DEFS) {
    const slots = [];
    for (let i = 0; i < def.tracks.length; i += 1) {
      const songName = def.tracks[i];
      const variants = await resolveVariants(songName);
      if (variants.length === 0) continue;
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
    identifierCache: Array.from(identifierCache.entries()).map(([identifier, value]) => ({
      identifier,
      stability: value?.stability || "good",
    })),
  };
  const target = resolve("data", "prebuilt-playlists.static.json");
  await writeFile(target, JSON.stringify(out, null, 2), "utf8");
  console.log(`wrote ${target} with ${playlists.length} playlists`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

