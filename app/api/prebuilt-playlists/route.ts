import { NextResponse } from "next/server";

import type { Track } from "@/components/player/store";

type ApiPrebuiltSlot = {
  canonicalTitle: string;
  variants: Track[];
  chainGroup?: string;
  chainOrder?: number;
};

type ApiPrebuiltPlaylist = {
  name: string;
  prebuiltKind: "album-live-comp";
  slots: ApiPrebuiltSlot[];
};

type CachedPayload = {
  generatedAt: number;
  playlists: ApiPrebuiltPlaylist[];
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const PREBUILT_DEFS: Array<{ name: string; tracks: string[]; chainFirstCount?: number }> = [
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

let cached: CachedPayload | null = null;
let buildInFlight: Promise<CachedPayload> | null = null;

function normalizeSongToken(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolvePlayableUrl(
  origin: string,
  identifier: string,
  preferredTitle: string,
): Promise<{ url: string; length?: string } | null> {
  try {
    const id = String(identifier || "").trim();
    if (!id) return null;
    const res = await fetch(`${origin}/api/ia/show-metadata?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      files?: Array<{ name?: string; title?: string; length?: string }>;
    };
    const files = Array.isArray(data?.files) ? data.files : [];
    const token = normalizeSongToken(preferredTitle);
    const audio = files.filter((f) => {
      const name = String(f?.name || "").toLowerCase();
      return (
        name.endsWith(".mp3") ||
        name.endsWith(".flac") ||
        name.endsWith(".ogg") ||
        name.endsWith(".m4a") ||
        name.endsWith(".wav")
      );
    });
    if (audio.length === 0) return null;
    const best =
      audio.find((f) => {
        const hay = normalizeSongToken(`${f?.title || ""} ${f?.name || ""}`);
        return token && hay && (hay.includes(token) || token.includes(hay));
      }) || audio[0];
    const fileName = String(best?.name || "").trim();
    if (!fileName) return null;
    return {
      url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}`,
      length: String(best?.length || "").trim() || undefined,
    };
  } catch {
    return null;
  }
}

async function fetchLiveVariants(origin: string, songName: string): Promise<Track[]> {
  try {
    const url = `${origin}/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      song?: {
        items?: Array<{
          defaultId?: string;
          showKey?: string;
          showDate?: string;
          title?: string;
          artwork?: string;
          matchedSongTitle?: string | null;
          matchedSongLength?: string | null;
          matchedSongUrl?: string | null;
        }>;
      };
    };
    const items = Array.isArray(data?.song?.items) ? data.song.items : [];
    const queryToken = normalizeSongToken(songName);
    const seenUrl = new Set<string>();
    const exactish: Track[] = [];
    const fallback: Track[] = [];
    for (const item of items) {
      let resolvedUrl = String(item?.matchedSongUrl || "").trim();
      const resolvedLength = String(item?.matchedSongLength || "").trim() || undefined;
      // Keep this endpoint fast in production: skip expensive metadata fallback here.
      // Client-side prebuilt ensure logic remains the deep fallback.
      if (!resolvedUrl || seenUrl.has(resolvedUrl)) continue;
      seenUrl.add(resolvedUrl);
      const titleRaw = String(item?.matchedSongTitle || songName);
      const titleNorm = normalizeSongToken(titleRaw);
      const candidate: Track = {
        title: songName,
        url: resolvedUrl,
        length: resolvedLength,
        track: "1",
        showKey: String(item?.showKey || "").trim() || undefined,
        showDate: String(item?.showDate || "").trim() || undefined,
        venueText: String(item?.title || "").trim() || undefined,
        artwork: String(item?.artwork || "").trim() || undefined,
      };
      if (
        queryToken &&
        titleNorm &&
        (titleNorm.includes(queryToken) || queryToken.includes(titleNorm))
      ) {
        exactish.push(candidate);
      } else {
        fallback.push(candidate);
      }
      if (exactish.length + fallback.length >= 8) break;
    }
    const quick = exactish.concat(fallback).slice(0, 3);
    if (quick.length > 0) return quick;

    // Single cheap fallback attempt using one top identifier only.
    const first = items[0];
    const fallbackId = String(first?.defaultId || "").trim();
    if (fallbackId) {
      const resolved = await resolvePlayableUrl(origin, fallbackId, songName);
      if (resolved?.url) {
        return [
          {
            title: songName,
            url: resolved.url,
            length: resolved.length,
            track: "1",
            showKey: String(first?.showKey || "").trim() || undefined,
            showDate: String(first?.showDate || "").trim() || undefined,
            venueText: String(first?.title || "").trim() || undefined,
            artwork: String(first?.artwork || "").trim() || undefined,
          },
        ];
      }
    }

    // Last-chance fallback: one direct IA identifier search, then resolve one playable URL.
    const token = normalizeSongToken(songName).split(" ").find(Boolean) || "";
    if (!token) return [];
    const q = [
      "mediatype:(audio OR etree)",
      "(collection:(KingGizzardAndTheLizardWizard) OR identifier:(kglw*))",
      `text:${token}*`,
    ].join(" AND ");
    const searchUrl =
      "https://archive.org/advancedsearch.php" +
      `?q=${encodeURIComponent(q)}` +
      "&fl[]=identifier&fl[]=title&rows=1&page=1&output=json&sort[]=downloads%20desc";
    const searchRes = await fetch(searchUrl, { cache: "no-store" });
    if (!searchRes.ok) return [];
    const searchData = (await searchRes.json()) as {
      response?: { docs?: Array<{ identifier?: string; title?: string }> };
    };
    const doc = Array.isArray(searchData?.response?.docs) ? searchData.response.docs[0] : undefined;
    const id = String(doc?.identifier || "").trim();
    if (!id) return [];
    const resolved = await resolvePlayableUrl(origin, id, songName);
    if (!resolved?.url) return [];
    return [
      {
        title: songName,
        url: resolved.url,
        length: resolved.length,
        track: "1",
        venueText: String(doc?.title || "").trim() || undefined,
      },
    ];
  } catch {
    return [];
  }
}

async function buildPayload(origin: string): Promise<CachedPayload> {
  const playlists: ApiPrebuiltPlaylist[] = [];
  for (const def of PREBUILT_DEFS) {
    const slotsSettled = await Promise.allSettled(
      def.tracks.map(async (trackTitle, i) => {
        const variants = await fetchLiveVariants(origin, trackTitle);
        if (variants.length < 1) return null;
        const fused = variants.length >= 2 ? variants : [variants[0], variants[0]];
        return {
          canonicalTitle: normalizeSongToken(trackTitle),
          variants: fused.slice(0, 5),
          chainGroup: def.chainFirstCount && i < def.chainFirstCount ? "intro" : undefined,
          chainOrder: def.chainFirstCount && i < def.chainFirstCount ? i + 1 : undefined,
        } as ApiPrebuiltSlot;
      }),
    );
    const slots = slotsSettled
      .map((s) => (s.status === "fulfilled" ? s.value : null))
      .filter(Boolean) as ApiPrebuiltSlot[];
    // Allow very partial albums so users always get some playable content.
    if (slots.length < 1) continue;
    playlists.push({
      name: def.name,
      prebuiltKind: "album-live-comp",
      slots,
    });
  }
  return { generatedAt: Date.now(), playlists };
}

export async function GET(request: Request) {
  const now = Date.now();
  if (cached && now - cached.generatedAt <= CACHE_TTL_MS) {
    return NextResponse.json(cached);
  }
  if (!buildInFlight) {
    const origin = new URL(request.url).origin;
    buildInFlight = buildPayload(origin)
      .then((result) => {
        if (result.playlists.length > 0) {
          cached = result;
          return result;
        }
        // Never replace a good cache with an empty payload.
        return cached || result;
      })
      .finally(() => {
        buildInFlight = null;
      });
  }
  const result = await buildInFlight;
  return NextResponse.json(result);
}
