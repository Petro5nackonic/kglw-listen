import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ORIGIN = process.env.KGLW_ORIGIN || "http://localhost:3000";

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

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function score(songName, trackTitle) {
  const n = normalize(songName);
  const h = normalize(trackTitle);
  if (!n || !h) return 0;
  if (h.includes(n) || n.includes(h)) return 100;
  const parts = n.split(" ").filter((p) => p.length >= 3);
  let overlap = 0;
  for (const p of parts) if (h.includes(p)) overlap += 1;
  return overlap;
}

async function resolveVariants(songName) {
  const shows = await fetchJson(
    `${ORIGIN}/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`,
  );
  const items = Array.isArray(shows?.song?.items) ? shows.song.items : [];
  for (const item of items.slice(0, 4)) {
    const id = String(item?.defaultId || "").trim();
    if (!id) continue;
    const detail = await fetchJson(`${ORIGIN}/api/ia/item?id=${encodeURIComponent(id)}`);
    const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
    const ranked = tracks
      .filter((t) => String(t?.url || "").trim())
      .map((t) => ({ t, s: score(songName, t?.title || "") }))
      .sort((a, b) => b.s - a.s);
    if (ranked.length === 0) continue;
    const best = ranked[0]?.t;
    const alt = ranked[1]?.t || ranked[0]?.t;
    if (!best?.url) continue;
    const make = (t) => ({
      title: songName,
      url: String(t.url),
      length: String(t.length || "").trim() || undefined,
      track: "1",
      showKey: String(item?.showKey || "").trim() || undefined,
      showDate: String(item?.showDate || "").trim() || undefined,
      venueText: String(item?.title || "").trim() || undefined,
      artwork: String(item?.artwork || "").trim() || undefined,
    });
    return [make(best), make(alt)];
  }
  return [];
}

async function main() {
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
      console.log(`resolved ${def.name} -> ${songName}`);
    }
    if (slots.length > 0) {
      playlists.push({
        name: def.name,
        prebuiltKind: "album-live-comp",
        slots,
      });
    }
  }
  const out = { generatedAt: Date.now(), playlists };
  const target = resolve("data", "prebuilt-playlists.static.json");
  await writeFile(target, JSON.stringify(out, null, 2), "utf8");
  console.log(`wrote ${target} with ${playlists.length} playlists`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

