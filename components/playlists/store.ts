import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Track } from "@/components/player/store";
import type { Playlist, PlaylistSlot } from "@/components/playlists/types";
import { moveItem, safeUUID } from "@/components/playlists/utils";
import { toDisplayTrackTitle } from "@/utils/displayTitle";

type PlaylistsState = {
  playlists: Playlist[];
  dismissedPrebuiltNames: string[];
  createPlaylist: (
    name: string,
    options?: { source?: "user" | "prebuilt"; prebuiltKind?: "album-live-comp" },
  ) => string;
  createDemoPlaylist: () => string;
  syncPrebuiltPlaylistsFromServer: () => Promise<void>;
  ensureFlightB741Playlist: () => Promise<void>;
  ensureMindFuzzLiveCompPlaylist: () => Promise<void>;
  ensureRequestedAlbumPlaylists: () => Promise<void>;
  seedDefaultAlbumPlaylists: () => Promise<void>;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;

  addTrack: (playlistId: string, track: Track) => "added" | "fused" | "exists";
  fuseTrack: (playlistId: string, track: Track) => "added" | "fused" | "exists";
  removeTrack: (playlistId: string, playlistSlotId: string) => void;
  moveTrack: (playlistId: string, fromIndex: number, toIndex: number) => void;
  linkWithNext: (playlistId: string, slotId: string) => void;
  unlinkSlot: (playlistId: string, slotId: string) => void;
  setChain: (playlistId: string, slotIds: string[]) => void;
  snapChain: (playlistId: string, groupId: string) => void;
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function canonicalTrackTitle(track: Track): string {
  return toDisplayTrackTitle(track.title)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function slotMatchesCanonical(slot: PlaylistSlot, canonical: string): boolean {
  if (!canonical) return false;
  if (slot.canonicalTitle === canonical) return true;
  return slot.variants.some((v) => canonicalTrackTitle(v.track) === canonical);
}

function slotHasPlayableVariant(slot: PlaylistSlot): boolean {
  return slot.variants.some((v) => Boolean(String(v?.track?.url || "").trim()));
}

function isPrebuiltPlaylist(playlist: Pick<Playlist, "source" | "prebuiltKind"> | undefined): boolean {
  return Boolean(
    playlist &&
      (playlist.source === "prebuilt" || playlist.prebuiltKind === "album-live-comp"),
  );
}

const DEFAULT_ALBUM_SEED_KEY = "kglw.defaultAlbumPlaylistsSeed.v2";
const DEFAULT_STUDIO_ALBUM_TITLES = [
  "12 Bar Bruise",
  "Eyes Like the Sky",
  "Float Along — Fill Your Lungs",
  "Oddments",
  "I'm in Your Mind Fuzz",
  "Quarters!",
  "Paper Mache Dream Balloon",
  "Nonagon Infinity",
  "Flying Microtonal Banana",
  "Murder of the Universe",
  "Sketches of Brunswick East",
  "Polygondwanaland",
  "Gumboot Soup",
  "Fishing for Fishies",
  "Infest the Rats' Nest",
  "K.G.",
  "L.W.",
  "Butterfly 3000",
  "Made in Timeland",
  "Omnium Gatherum",
  "Ice, Death, Planets, Lungs, Mushrooms And Lava",
  "Laminated Denim",
  "Changes",
  "PetroDragonic Apocalypse",
  "The Silver Cord",
];
const FLIGHT_B741_PLAYLIST_NAME = "Flight B741 Live Comp.";
const FLIGHT_B741_SEEDED_KEY = "kglw.flightB741Seeded.v1";
const MIND_FUZZ_LIVE_COMP_NAME = "I'm In Your Mind Fuzz Live Comp.";
const MIND_FUZZ_LIVE_COMP_SEEDED_KEY = "kglw.mindFuzzLiveCompSeeded.v1";
const MIND_FUZZ_LIVE_COMP_TRACK_ORDER = [
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
];
const REQUESTED_ALBUMS_SEEDED_KEY = "kglw.requestedAlbumPlaylistsSeed.v1";
const REQUESTED_PREBUILT_ALBUMS = [
  "Infest the Rats' Nest",
  "I'm in Your Mind Fuzz",
  "Nonagon Infinity",
  "PetroDragonic Apocalypse",
  "The Silver Chord",
];
const REQUESTED_ALBUM_TRACK_FALLBACKS: Record<string, string[]> = {
  "infest the rats' nest": [
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
  "i'm in your mind fuzz": [
    "I'm in Your Mind",
    "I'm Not in Your Mind",
    "Cellophane",
    "I'm in Your Mind Fuzz",
    "Empty",
    "Hot Water",
    "Am I in Heaven?",
    "Slow Jam 1",
    "Satan Speeds Up",
    "Her and I (Slow Jam 2)",
  ],
  "nonagon infinity": [
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
  "petrodragonic apocalypse": [
    "Motor Spirit",
    "Supercell",
    "Converge",
    "Witchcraft",
    "Gila Monster",
    "Dragon",
    "Flamethrower",
  ],
  "the silver chord": [
    "Theia",
    "The Silver Cord",
    "Set",
    "Chang'e",
    "Gilgamesh",
    "Swan Song",
    "Extinction",
  ],
};
const FLIGHT_B741_TRACK_ORDER = [
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
];
const STATIC_PREBUILT_SEED_DEFS: Array<{ name: string; tracks: string[]; chainFirstCount?: number }> = [
  { name: FLIGHT_B741_PLAYLIST_NAME, tracks: FLIGHT_B741_TRACK_ORDER },
  { name: MIND_FUZZ_LIVE_COMP_NAME, tracks: MIND_FUZZ_LIVE_COMP_TRACK_ORDER, chainFirstCount: 4 },
  { name: "Infest the Rats' Nest", tracks: REQUESTED_ALBUM_TRACK_FALLBACKS["infest the rats' nest"] || [] },
  { name: "Nonagon Infinity", tracks: REQUESTED_ALBUM_TRACK_FALLBACKS["nonagon infinity"] || [] },
  {
    name: "Petrodragonic Apocalypse",
    tracks: REQUESTED_ALBUM_TRACK_FALLBACKS["petrodragonic apocalypse"] || [],
  },
  { name: "The Silver Chord", tracks: REQUESTED_ALBUM_TRACK_FALLBACKS["the silver chord"] || [] },
];

let defaultAlbumSeedInFlight: Promise<void> | null = null;
let flightB741SeedInFlight: Promise<void> | null = null;
let mindFuzzLiveCompSeedInFlight: Promise<void> | null = null;
let requestedAlbumsSeedInFlight: Promise<void> | null = null;

function toApiSlug(input: string): string {
  return encodeURIComponent(String(input || "").trim()).replace(/%20/g, "+");
}

function normalizeSongToken(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type LegacyPlaylistTrack = {
  id: string;
  addedAt: number;
  track: Track;
};

type LegacyPlaylist = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  source?: "user" | "prebuilt";
  prebuiltKind?: "album-live-comp";
  tracks?: LegacyPlaylistTrack[];
  slots?: Playlist["slots"];
};

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

function buildStaticPrebuiltSeedPlaylists(now = Date.now()): Playlist[] {
  return STATIC_PREBUILT_SEED_DEFS.filter((def) => def.tracks.length > 0).map((def) => {
    const linkGroupId = def.chainFirstCount ? safeUUID() : undefined;
    const slots: PlaylistSlot[] = def.tracks.map((title, idx) => ({
      id: safeUUID(),
      canonicalTitle: normalizeSongToken(title) || canonicalTrackTitle({ title, url: "" }),
      addedAt: now,
      updatedAt: now,
      linkGroupId: linkGroupId && idx < (def.chainFirstCount || 0) ? linkGroupId : undefined,
      chainOrder: linkGroupId && idx < (def.chainFirstCount || 0) ? idx + 1 : undefined,
      variants: [
        { id: safeUUID(), addedAt: now, track: { title, url: "", artwork: "/api/default-artwork" } },
        { id: safeUUID(), addedAt: now, track: { title, url: "", artwork: "/api/default-artwork" } },
      ],
    }));
    return {
      id: safeUUID(),
      name: def.name,
      createdAt: now,
      updatedAt: now,
      source: "prebuilt",
      prebuiltKind: "album-live-comp",
      slots,
    };
  });
}

function migratePlaylist(raw: LegacyPlaylist): Playlist {
  const inferredPrebuilt =
    !raw.source &&
    String(raw.name || "").trim().toLowerCase() === FLIGHT_B741_PLAYLIST_NAME.toLowerCase();
  const source = raw.source || (inferredPrebuilt ? "prebuilt" : "user");
  const prebuiltKind = raw.prebuiltKind || (inferredPrebuilt ? "album-live-comp" : undefined);

  if (Array.isArray(raw.slots)) {
    return {
      id: raw.id,
      name: raw.name,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      source,
      prebuiltKind,
      slots: raw.slots,
    };
  }

  const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];
  const slots = tracks.map((t) => ({
    id: t.id || safeUUID(),
    canonicalTitle: canonicalTrackTitle(t.track),
    addedAt: t.addedAt || Date.now(),
    updatedAt: t.addedAt || Date.now(),
    variants: [
      {
        id: t.id || safeUUID(),
        addedAt: t.addedAt || Date.now(),
        track: t.track,
      },
    ],
  }));

  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    source,
    prebuiltKind,
    slots,
  };
}

export const usePlaylists = create<PlaylistsState>()(
  persist(
    (set, get) => ({
      playlists: buildStaticPrebuiltSeedPlaylists(),
      dismissedPrebuiltNames: [],

      createPlaylist: (name, options) => {
        const normalized = normalizeName(name);
        const id = safeUUID();
        const now = Date.now();

        const playlist: Playlist = {
          id,
          name: normalized || "New playlist",
          createdAt: now,
          updatedAt: now,
          source: options?.source || "user",
          prebuiltKind: options?.prebuiltKind,
          slots: [],
        };

        set({ playlists: [playlist, ...get().playlists] });
        return id;
      },

      createDemoPlaylist: () => {
        const id = safeUUID();
        const now = Date.now();
        const linkGroupId = safeUUID();

        const makeVariant = (title: string, url: string, length: string) => ({
          id: safeUUID(),
          addedAt: now,
          track: { title, url, length },
        });

        const playlist: Playlist = {
          id,
          name: "Demo: Fused + Chained",
          createdAt: now,
          updatedAt: now,
          source: "user",
          slots: [
            {
              id: safeUUID(),
              canonicalTitle: "rattlesnake",
              addedAt: now,
              updatedAt: now,
              variants: [
                makeVariant(
                  "Rattlesnake",
                  "https://archive.org/download/kglw2024-09-14.sbd/01%20Rattlesnake.flac",
                  "11:35",
                ),
                makeVariant(
                  "Rattlesnake",
                  "https://archive.org/download/kglw2025-08-17.sbd/01%20Rattlesnake.flac",
                  "10:58",
                ),
              ],
            },
            {
              id: safeUUID(),
              canonicalTitle: "mirage city",
              addedAt: now,
              updatedAt: now,
              linkGroupId,
              variants: [
                makeVariant(
                  "Mirage City",
                  "https://archive.org/download/kglw2024-09-14.sbd/14%20Mirage%20City.flac",
                  "3:41",
                ),
              ],
            },
            {
              id: safeUUID(),
              canonicalTitle: "let me mend the past",
              addedAt: now,
              updatedAt: now,
              linkGroupId,
              variants: [
                makeVariant(
                  "Let Me Mend The Past",
                  "https://archive.org/download/kglw2024-09-14.sbd/15%20Let%20Me%20Mend%20The%20Past.flac",
                  "5:36",
                ),
              ],
            },
            {
              id: safeUUID(),
              canonicalTitle: "mirage city",
              addedAt: now,
              updatedAt: now,
              linkGroupId,
              variants: [
                makeVariant(
                  "Mirage City",
                  "https://archive.org/download/kglw2024-09-14.sbd/16%20Mirage%20City.flac",
                  "4:21",
                ),
              ],
            },
            {
              id: safeUUID(),
              canonicalTitle: "magma",
              addedAt: now,
              updatedAt: now,
              variants: [
                makeVariant(
                  "Magma",
                  "https://archive.org/download/kglw2024-09-14.sbd/05%20Magma.flac",
                  "11:14",
                ),
                makeVariant(
                  "Magma",
                  "https://archive.org/download/kglw2025-08-17.sbd/07%20Magma.flac",
                  "9:48",
                ),
                makeVariant(
                  "Magma",
                  "https://archive.org/download/kglw2025-08-16.sbd/06%20Magma.flac",
                  "10:22",
                ),
              ],
            },
          ],
        };

        set({ playlists: [playlist, ...get().playlists] });
        return id;
      },

      syncPrebuiltPlaylistsFromServer: async () => {
        if (typeof window === "undefined") return;
        try {
          const res = await fetch("/api/prebuilt-playlists", { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as {
            playlists?: ApiPrebuiltPlaylist[];
          };
          const incoming = Array.isArray(data?.playlists) ? data.playlists : [];
          if (incoming.length === 0) return;

          const dismissed = new Set(
            (get().dismissedPrebuiltNames || []).map((n) => n.trim().toLowerCase()),
          );
          const now = Date.now();
          const current = get().playlists.slice();

          for (const payload of incoming) {
            const name = String(payload?.name || "").trim();
            if (!name) continue;
            if (dismissed.has(name.toLowerCase())) continue;
            const rawSlots = Array.isArray(payload?.slots) ? payload.slots : [];
            if (rawSlots.length === 0) continue;

            const chainGroupIds = new Map<string, string>();
            const slots: PlaylistSlot[] = rawSlots
              .map((slot) => {
                const variants = Array.isArray(slot?.variants) ? slot.variants : [];
                if (variants.length === 0) return null;
                const chainKey = String(slot?.chainGroup || "").trim();
                const linkGroupId = chainKey
                  ? (chainGroupIds.get(chainKey) ||
                    (() => {
                      const id = safeUUID();
                      chainGroupIds.set(chainKey, id);
                      return id;
                    })())
                  : undefined;
                return {
                  id: safeUUID(),
                  canonicalTitle: String(slot?.canonicalTitle || "").trim() || canonicalTrackTitle(variants[0]),
                  addedAt: now,
                  updatedAt: now,
                  linkGroupId,
                  chainOrder:
                    typeof slot?.chainOrder === "number" && Number.isFinite(slot.chainOrder)
                      ? slot.chainOrder
                      : undefined,
                  variants: variants.map((track) => ({
                    id: safeUUID(),
                    addedAt: now,
                    track,
                  })),
                } as PlaylistSlot;
              })
              .filter(Boolean) as PlaylistSlot[];
            if (slots.length === 0) continue;

            const existingIdx = current.findIndex((p) => p.name.trim().toLowerCase() === name.toLowerCase());
            if (existingIdx >= 0) {
              const existing = current[existingIdx];
              if (existing.source && existing.source !== "prebuilt") continue;
              current[existingIdx] = {
                ...existing,
                name,
                updatedAt: now,
                source: "prebuilt",
                prebuiltKind: payload.prebuiltKind || "album-live-comp",
                slots,
              };
            } else {
              current.unshift({
                id: safeUUID(),
                name,
                createdAt: now,
                updatedAt: now,
                source: "prebuilt",
                prebuiltKind: payload.prebuiltKind || "album-live-comp",
                slots,
              });
            }
          }

          set({ playlists: current });
        } catch {
          // Ignore transient network errors.
        }
      },

      ensureFlightB741Playlist: async () => {
        if (typeof window === "undefined") return;
        if (flightB741SeedInFlight) return flightB741SeedInFlight;

        flightB741SeedInFlight = (async () => {
          const hasSeedMarker = window.localStorage.getItem(FLIGHT_B741_SEEDED_KEY) === "1";
          const existingReady = get().playlists.find(
            (p) =>
              p.name.trim().toLowerCase() === FLIGHT_B741_PLAYLIST_NAME.toLowerCase() &&
              p.slots.length === FLIGHT_B741_TRACK_ORDER.length &&
              p.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s)),
          );
          if (existingReady) {
            window.localStorage.setItem(FLIGHT_B741_SEEDED_KEY, "1");
            return;
          }
          if (hasSeedMarker) {
            // Stale seed marker: playlist exists but is still placeholder/incomplete.
            window.localStorage.removeItem(FLIGHT_B741_SEEDED_KEY);
          }

          async function fetchMostPlayedVariants(songName: string): Promise<Track[]> {
            try {
              async function resolvePlayableUrl(
                identifier: string,
                preferredTitle: string,
              ): Promise<{ url: string; length?: string; title?: string } | null> {
                try {
                  const id = String(identifier || "").trim();
                  if (!id) return null;
                  const res = await fetch(`/api/ia/show-metadata?id=${encodeURIComponent(id)}`, {
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
                  const exact =
                    audio.find((f) => {
                      const hay = normalizeSongToken(`${f?.title || ""} ${f?.name || ""}`);
                      return token && hay && (hay.includes(token) || token.includes(hay));
                    }) || audio[0];
                  const fileName = String(exact?.name || "").trim();
                  if (!fileName) return null;
                  return {
                    url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}`,
                    length: String(exact?.length || "").trim() || undefined,
                    title: String(exact?.title || "").trim() || undefined,
                  };
                } catch {
                  return null;
                }
              }

              const url = `/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`;
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
              const strong: Track[] = [];
              const weak: Track[] = [];
              const seenUrl = new Set<string>();
              for (const item of items) {
                let resolvedUrl = String(item?.matchedSongUrl || "").trim();
                let resolvedLength = String(item?.matchedSongLength || "").trim() || undefined;
                let resolvedTitle = String(item?.matchedSongTitle || "").trim() || undefined;
                if (!resolvedUrl && item?.defaultId) {
                  const fallback = await resolvePlayableUrl(item.defaultId, songName);
                  if (fallback?.url) {
                    resolvedUrl = fallback.url;
                    resolvedLength = fallback.length || resolvedLength;
                    resolvedTitle = fallback.title || resolvedTitle;
                  }
                }
                if (!resolvedUrl || seenUrl.has(resolvedUrl)) continue;
                const matchedTitle = String(item?.matchedSongTitle || "");
                const matchedNorm = normalizeSongToken(matchedTitle);
                seenUrl.add(resolvedUrl);
                // Use the canonical studio title for all variants so they fuse into one slot.
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
                  matchedNorm &&
                  (matchedNorm.includes(queryToken) || queryToken.includes(matchedNorm))
                ) {
                  strong.push(candidate);
                } else {
                  weak.push(candidate);
                }
                if (strong.length + weak.length >= 12) break;
              }
              const merged = strong.concat(weak).slice(0, 5);
              if (merged.length >= 2) return merged;

              // Fallback: direct IA identifier search by song text, then resolve playable URL.
              const firstToken = queryToken.split(" ").filter(Boolean)[0] || queryToken;
              if (!firstToken) return merged;
              const q = [
                "mediatype:(audio OR etree)",
                "(collection:(KingGizzardAndTheLizardWizard) OR identifier:(kglw*))",
                `text:${firstToken}*`,
              ].join(" AND ");
              const searchUrl =
                "https://archive.org/advancedsearch.php" +
                `?q=${encodeURIComponent(q)}` +
                "&fl[]=identifier&rows=60&page=1&output=json&sort[]=downloads%20desc";
              const searchRes = await fetch(searchUrl, { cache: "no-store" });
              if (!searchRes.ok) return merged;
              const searchData = (await searchRes.json()) as {
                response?: { docs?: Array<{ identifier?: string }> };
              };
              const docs = Array.isArray(searchData?.response?.docs)
                ? searchData.response.docs
                : [];
              const fallbackOut = merged.slice();
              for (const doc of docs) {
                if (fallbackOut.length >= 5) break;
                const identifier = String(doc?.identifier || "").trim();
                if (!identifier) continue;
                const fallback = await resolvePlayableUrl(identifier, songName);
                if (!fallback?.url || seenUrl.has(fallback.url)) continue;
                seenUrl.add(fallback.url);
                fallbackOut.push({
                  title: songName,
                  url: fallback.url,
                  length: fallback.length,
                  track: "1",
                });
              }
              return fallbackOut.slice(0, 5);
            } catch {
              return [];
            }
          }

          // Build deterministic track -> variants map in album order.
          const variantsByTrack: Track[][] = [];
          for (const song of FLIGHT_B741_TRACK_ORDER) {
            const variants = await fetchMostPlayedVariants(song);
            if (variants.length < 1) {
              variantsByTrack.length = 0;
              break;
            }
            variantsByTrack.push(variants.slice(0, 5));
          }
          if (variantsByTrack.length !== FLIGHT_B741_TRACK_ORDER.length) return;

          const existingByName = new Map(
            get().playlists.map((p) => [p.name.trim().toLowerCase(), p]),
          );
          const existing =
            existingByName.get(FLIGHT_B741_PLAYLIST_NAME.toLowerCase()) ||
            existingByName.get("flight b741");
          if (existing) get().deletePlaylist(existing.id);

          const playlistId = get().createPlaylist(FLIGHT_B741_PLAYLIST_NAME, {
            source: "prebuilt",
            prebuiltKind: "album-live-comp",
          });
          for (const variants of variantsByTrack) {
            get().addTrack(playlistId, variants[0]);
            const fused = variants.length >= 2 ? variants : [variants[0], variants[0]];
            for (const variant of fused.slice(1)) {
              get().addTrack(playlistId, variant);
            }
          }

          const created = get().playlists.find((p) => p.id === playlistId);
          if (!created || created.slots.length !== FLIGHT_B741_TRACK_ORDER.length) {
            get().deletePlaylist(playlistId);
            return;
          }
          window.localStorage.setItem(FLIGHT_B741_SEEDED_KEY, "1");
        })().finally(() => {
          flightB741SeedInFlight = null;
        });

        return flightB741SeedInFlight;
      },

      ensureMindFuzzLiveCompPlaylist: async () => {
        if (typeof window === "undefined") return;
        if (mindFuzzLiveCompSeedInFlight) return mindFuzzLiveCompSeedInFlight;

        mindFuzzLiveCompSeedInFlight = (async () => {
          const existingReady = get().playlists.find((p) => {
            if (p.name.trim().toLowerCase() !== MIND_FUZZ_LIVE_COMP_NAME.toLowerCase()) {
              return false;
            }
            if (p.slots.length !== MIND_FUZZ_LIVE_COMP_TRACK_ORDER.length) return false;
            if (!p.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s)))
              return false;
            const firstFour = p.slots.slice(0, 4);
            if (firstFour.length < 4) return false;
            const chainId = firstFour[0]?.linkGroupId;
            if (!chainId) return false;
            return firstFour.every((s, idx) => s.linkGroupId === chainId && s.chainOrder === idx + 1);
          });
          if (existingReady) {
            window.localStorage.setItem(MIND_FUZZ_LIVE_COMP_SEEDED_KEY, "1");
            return;
          }
          if (window.localStorage.getItem(MIND_FUZZ_LIVE_COMP_SEEDED_KEY) === "1") {
            window.localStorage.removeItem(MIND_FUZZ_LIVE_COMP_SEEDED_KEY);
          }

          const existingByName = get().playlists.find(
            (p) => p.name.trim().toLowerCase() === MIND_FUZZ_LIVE_COMP_NAME.toLowerCase(),
          );
          if (existingByName) get().deletePlaylist(existingByName.id);

          async function fetchLiveVariants(songName: string): Promise<Track[]> {
            try {
              async function resolvePlayableUrl(
                identifier: string,
                preferredTitle: string,
              ): Promise<{ url: string; length?: string; title?: string } | null> {
                try {
                  const id = String(identifier || "").trim();
                  if (!id) return null;
                  const res = await fetch(`/api/ia/show-metadata?id=${encodeURIComponent(id)}`, {
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
                    title: String(best?.title || "").trim() || undefined,
                  };
                } catch {
                  return null;
                }
              }

              const url = `/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`;
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
                let u = String(item?.matchedSongUrl || "").trim();
                let resolvedLength = String(item?.matchedSongLength || "").trim() || undefined;
                if (!u && item?.defaultId) {
                  const resolved = await resolvePlayableUrl(item.defaultId, songName);
                  if (resolved?.url) {
                    u = resolved.url;
                    resolvedLength = resolved.length || resolvedLength;
                  }
                }
                if (!u || seenUrl.has(u)) continue;
                const titleRaw = String(item?.matchedSongTitle || songName);
                const titleNorm = normalizeSongToken(titleRaw);
                seenUrl.add(u);
                const candidate: Track = {
                  title: songName,
                  url: u,
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
                if (exactish.length + fallback.length >= 16) break;
              }
              return exactish.concat(fallback).slice(0, 5);
            } catch {
              return [];
            }
          }

          const variantsByTrack: Track[][] = [];
          for (const song of MIND_FUZZ_LIVE_COMP_TRACK_ORDER) {
            const variants = await fetchLiveVariants(song);
            if (variants.length < 1) {
              variantsByTrack.length = 0;
              break;
            }
            variantsByTrack.push(variants.slice(0, 5));
          }
          if (variantsByTrack.length !== MIND_FUZZ_LIVE_COMP_TRACK_ORDER.length) return;

          const playlistId = get().createPlaylist(MIND_FUZZ_LIVE_COMP_NAME, {
            source: "prebuilt",
            prebuiltKind: "album-live-comp",
          });
          for (const variants of variantsByTrack) {
            get().addTrack(playlistId, variants[0]);
            const fused = variants.length >= 2 ? variants : [variants[0], variants[0]];
            for (const variant of fused.slice(1)) {
              get().addTrack(playlistId, variant);
            }
          }

          const createdBeforeChain = get().playlists.find((p) => p.id === playlistId);
          if (
            !createdBeforeChain ||
            createdBeforeChain.slots.length !== MIND_FUZZ_LIVE_COMP_TRACK_ORDER.length ||
            !createdBeforeChain.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s))
          ) {
            get().deletePlaylist(playlistId);
            return;
          }

          const chainIds = createdBeforeChain.slots.slice(0, 4).map((s) => s.id);
          if (chainIds.length === 4) {
            get().setChain(playlistId, chainIds);
          }

          const created = get().playlists.find((p) => p.id === playlistId);
          const firstFour = created?.slots.slice(0, 4) || [];
          const chainId = firstFour[0]?.linkGroupId;
          const chainReady =
            firstFour.length === 4 &&
            Boolean(chainId) &&
            firstFour.every((s, idx) => s.linkGroupId === chainId && s.chainOrder === idx + 1);
          if (
            !created ||
            created.slots.length !== MIND_FUZZ_LIVE_COMP_TRACK_ORDER.length ||
            !created.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s)) ||
            !chainReady
          ) {
            get().deletePlaylist(playlistId);
            return;
          }

          window.localStorage.setItem(MIND_FUZZ_LIVE_COMP_SEEDED_KEY, "1");
        })().finally(() => {
          mindFuzzLiveCompSeedInFlight = null;
        });

        return mindFuzzLiveCompSeedInFlight;
      },

      ensureRequestedAlbumPlaylists: async () => {
        if (typeof window === "undefined") return;
        if (requestedAlbumsSeedInFlight) return requestedAlbumsSeedInFlight;

        requestedAlbumsSeedInFlight = (async () => {
          const requestedByName = new Set(
            REQUESTED_PREBUILT_ALBUMS.map((name) => name.trim().toLowerCase()),
          );
          const existingByName = new Map(
            get().playlists.map((p) => [p.name.trim().toLowerCase(), p]),
          );
          const allReady = REQUESTED_PREBUILT_ALBUMS.every((albumTitle) => {
            const pl = existingByName.get(albumTitle.trim().toLowerCase());
            return Boolean(
              pl &&
                pl.source === "prebuilt" &&
                pl.prebuiltKind === "album-live-comp" &&
                pl.slots.length > 0 &&
                pl.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s)),
            );
          });
          if (allReady) {
            window.localStorage.setItem(REQUESTED_ALBUMS_SEEDED_KEY, "1");
            return;
          }
          if (window.localStorage.getItem(REQUESTED_ALBUMS_SEEDED_KEY) === "1") {
            // Stale seed marker: required playlists are missing/incomplete, so reseed.
            window.localStorage.removeItem(REQUESTED_ALBUMS_SEEDED_KEY);
          }

          async function fetchAlbumTracks(albumTitle: string): Promise<string[]> {
            const key = albumTitle.toLowerCase();
            const attempts =
              key === "the silver chord"
                ? [albumTitle, "The Silver Cord"]
                : [albumTitle];
            for (const title of attempts) {
              try {
                const url =
                  `https://kglw.net/api/v2/albums/album_title/${toApiSlug(title)}.json` +
                  "?artist_id=1&order_by=position&direction=asc";
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) continue;
                const data = (await res.json()) as {
                  error?: boolean;
                  data?: Array<{
                    song_name?: string;
                    islive?: number | string;
                    position?: number | string;
                  }>;
                };
                if (data?.error) continue;
                const rows = Array.isArray(data?.data) ? data.data : [];
                const ordered = rows
                  .filter((r) => Number(r?.islive ?? 0) === 0)
                  .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
                const out: string[] = [];
                const seen = new Set<string>();
                for (const row of ordered) {
                  const song = String(row?.song_name || "").trim();
                  if (!song) continue;
                  const key = song.toLowerCase();
                  if (seen.has(key)) continue;
                  seen.add(key);
                  out.push(song);
                }
                if (out.length > 0) return out;
              } catch {
                // continue trying fallback title
              }
            }
            return REQUESTED_ALBUM_TRACK_FALLBACKS[key] || [];
          }

          async function fetchLiveVariants(songName: string): Promise<Track[]> {
            try {
              async function resolvePlayableUrl(
                identifier: string,
                preferredTitle: string,
              ): Promise<{ url: string; length?: string; title?: string } | null> {
                try {
                  const id = String(identifier || "").trim();
                  if (!id) return null;
                  const res = await fetch(`/api/ia/show-metadata?id=${encodeURIComponent(id)}`, {
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
                    title: String(best?.title || "").trim() || undefined,
                  };
                } catch {
                  return null;
                }
              }

              const url = `/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`;
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
                let u = String(item?.matchedSongUrl || "").trim();
                let resolvedLength = String(item?.matchedSongLength || "").trim() || undefined;
                if (!u && item?.defaultId) {
                  const resolved = await resolvePlayableUrl(item.defaultId, songName);
                  if (resolved?.url) {
                    u = resolved.url;
                    resolvedLength = resolved.length || resolvedLength;
                  }
                }
                if (!u || seenUrl.has(u)) continue;
                const titleRaw = String(item?.matchedSongTitle || songName);
                const titleNorm = normalizeSongToken(titleRaw);
                seenUrl.add(u);
                const candidate: Track = {
                  title: songName,
                  url: u,
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
                if (exactish.length + fallback.length >= 14) break;
              }
              return exactish.concat(fallback).slice(0, 5);
            } catch {
              return [];
            }
          }

          for (const albumTitle of REQUESTED_PREBUILT_ALBUMS) {
            const albumKey = albumTitle.trim().toLowerCase();
            const existing = existingByName.get(albumKey);
            if (
              existing &&
              existing.source === "prebuilt" &&
              existing.prebuiltKind === "album-live-comp" &&
              existing.slots.length > 0 &&
              existing.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s))
            ) {
              continue;
            }
            if (existing && requestedByName.has(albumKey)) get().deletePlaylist(existing.id);

            const tracks = await fetchAlbumTracks(albumTitle);
            if (tracks.length === 0) continue;

            const variantsByTrack: Track[][] = [];
            for (const song of tracks) {
              const variants = await fetchLiveVariants(song);
              if (variants.length < 1) {
                variantsByTrack.length = 0;
                break;
              }
              variantsByTrack.push(variants.slice(0, 5));
            }
            if (variantsByTrack.length !== tracks.length) continue;

            const playlistId = get().createPlaylist(albumTitle, {
              source: "prebuilt",
              prebuiltKind: "album-live-comp",
            });
            for (const variants of variantsByTrack) {
              get().addTrack(playlistId, variants[0]);
              const fused = variants.length >= 2 ? variants : [variants[0], variants[0]];
              for (const variant of fused.slice(1)) {
                get().addTrack(playlistId, variant);
              }
            }
            const created = get().playlists.find((p) => p.id === playlistId);
            if (
              !created ||
              created.slots.length !== tracks.length ||
              !created.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s))
            ) {
              get().deletePlaylist(playlistId);
              continue;
            }
            existingByName.set(albumKey, created);
          }

          const finished = REQUESTED_PREBUILT_ALBUMS.every((albumTitle) => {
            const pl = get().playlists.find(
              (p) =>
                p.name.trim().toLowerCase() === albumTitle.trim().toLowerCase() &&
                p.source === "prebuilt" &&
                p.prebuiltKind === "album-live-comp" &&
                p.slots.length > 0 &&
                p.slots.every((s) => s.variants.length >= 2 && slotHasPlayableVariant(s)),
            );
            return Boolean(pl);
          });
          if (finished) {
            window.localStorage.setItem(REQUESTED_ALBUMS_SEEDED_KEY, "1");
          }
        })().finally(() => {
          requestedAlbumsSeedInFlight = null;
        });

        return requestedAlbumsSeedInFlight;
      },

      seedDefaultAlbumPlaylists: async () => {
        if (typeof window === "undefined") return;
        if (defaultAlbumSeedInFlight) return defaultAlbumSeedInFlight;
        if (window.localStorage.getItem(DEFAULT_ALBUM_SEED_KEY) === "1") return;

        defaultAlbumSeedInFlight = (async () => {
          const existing = get().playlists;
          const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));

          async function fetchAlbumTracks(albumTitle: string): Promise<string[]> {
            try {
              const url =
                `https://kglw.net/api/v2/albums/album_title/${toApiSlug(albumTitle)}.json` +
                "?artist_id=1&order_by=position&direction=asc";
              const res = await fetch(url, { cache: "no-store" });
              if (!res.ok) return [];
              const data = (await res.json()) as {
                error?: boolean;
                data?: Array<{ song_name?: string; islive?: number | string; position?: number | string }>;
              };
              if (data?.error) return [];
              const rows = Array.isArray(data?.data) ? data.data : [];
              const ordered = rows
                .filter((r) => Number(r?.islive ?? 0) === 0)
                .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
              const out: string[] = [];
              const seen = new Set<string>();
              for (const row of ordered) {
                const song = String(row?.song_name || "").trim();
                if (!song) continue;
                const key = song.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(song);
              }
              return out;
            } catch {
              return [];
            }
          }

          async function fetchLiveVariants(songName: string): Promise<Track[]> {
            try {
              const url = `/api/ia/shows?page=1&sort=most_played&query=${encodeURIComponent(songName)}`;
              const res = await fetch(url, { cache: "no-store" });
              if (!res.ok) return [];
              const data = (await res.json()) as {
                song?: {
                  items?: Array<{
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
                const u = String(item?.matchedSongUrl || "").trim();
                if (!u || seenUrl.has(u)) continue;
                const titleRaw = String(item?.matchedSongTitle || songName);
                const titleNorm = normalizeSongToken(titleRaw);
                seenUrl.add(u);
                const candidate: Track = {
                  title: toDisplayTrackTitle(titleRaw),
                  url: u,
                  length: String(item?.matchedSongLength || "").trim() || undefined,
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
                if (exactish.length + fallback.length >= 12) break;
              }
              const merged = exactish.concat(fallback);
              return merged.slice(0, 4);
            } catch {
              return [];
            }
          }

          // Process albums sequentially to avoid API bursts.
          for (const albumTitle of DEFAULT_STUDIO_ALBUM_TITLES) {
            const tracks = await fetchAlbumTracks(albumTitle);
            if (tracks.length === 0) continue;

            const existingPlaylist = existingByName.get(albumTitle.toLowerCase());
            if (existingPlaylist && existingPlaylist.slots.length === tracks.length) {
              continue;
            }
            if (existingPlaylist && existingPlaylist.slots.length !== tracks.length) {
              get().deletePlaylist(existingPlaylist.id);
            }

            const variantsByTrack: Track[][] = [];
            for (const song of tracks) {
              const variants = await fetchLiveVariants(song);
              if (variants.length === 0) {
                variantsByTrack.length = 0;
                break;
              }
              variantsByTrack.push(variants);
            }
            // Never create partial albums.
            if (variantsByTrack.length !== tracks.length) continue;

            const playlistId = get().createPlaylist(albumTitle, {
              source: "prebuilt",
              prebuiltKind: "album-live-comp",
            });
            for (const variants of variantsByTrack) {
              // First variant creates slot at correct studio-order position.
              get().addTrack(playlistId, variants[0]);
              // Remaining variants fuse into the same slot.
              for (const variant of variants.slice(1)) {
                get().addTrack(playlistId, variant);
              }
            }
            const created = get().playlists.find((p) => p.id === playlistId);
            if (!created || created.slots.length !== tracks.length) {
              // Guard rail: if anything drifted, remove it instead of keeping partial output.
              get().deletePlaylist(playlistId);
              continue;
            }

            // Keep local map in sync for subsequent albums.
            existingByName.set(albumTitle.toLowerCase(), created);
          }

          window.localStorage.setItem(DEFAULT_ALBUM_SEED_KEY, "1");
        })().finally(() => {
          defaultAlbumSeedInFlight = null;
        });

        return defaultAlbumSeedInFlight;
      },

      renamePlaylist: (playlistId, name) => {
        const normalized = normalizeName(name);
        if (!normalized) return;

        set({
          playlists: get().playlists.map((p) =>
            p.id === playlistId
              ? { ...p, name: normalized, updatedAt: Date.now() }
              : p,
          ),
        });
      },

      deletePlaylist: (playlistId) => {
        const target = get().playlists.find((p) => p.id === playlistId) || null;
        const nextDismissed =
          target?.source === "prebuilt"
            ? Array.from(
                new Set(
                  (get().dismissedPrebuiltNames || []).concat(
                    String(target.name || "").trim().toLowerCase(),
                  ),
                ),
              )
            : get().dismissedPrebuiltNames;
        set({
          playlists: get().playlists.filter((p) => p.id !== playlistId),
          dismissedPrebuiltNames: nextDismissed,
        });
      },

      addTrack: (playlistId, track) => {
        let result: "added" | "fused" | "exists" = "exists";
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const now = Date.now();
            const canonical = canonicalTrackTitle(track);
            const slotIdx = p.slots.findIndex((s) => slotMatchesCanonical(s, canonical));

            if (slotIdx < 0) {
              result = "added";
              return {
                ...p,
                updatedAt: now,
                slots: p.slots.concat({
                  id: safeUUID(),
                  canonicalTitle: canonical,
                  addedAt: now,
                  updatedAt: now,
                  variants: [{ id: safeUUID(), addedAt: now, track }],
                }),
              };
            }

            const slot = p.slots[slotIdx];
            const already = slot.variants.some((v) => v.track.url === track.url);
            if (already) {
              result = "exists";
              return p;
            }
            result = "fused";
            const nextSlots = p.slots.slice();
            nextSlots[slotIdx] = {
              ...slot,
              canonicalTitle: canonical,
              updatedAt: now,
              variants: slot.variants.concat({
                id: safeUUID(),
                addedAt: now,
                track,
              }),
            };
            return {
              ...p,
              updatedAt: now,
              slots: nextSlots,
            };
          }),
        });
        return result;
      },

      fuseTrack: (playlistId, track) => {
        // Fuse follows same behavior as addTrack in slot model.
        return get().addTrack(playlistId, track);
      },

      removeTrack: (playlistId, playlistSlotId) => {
        set({
          playlists: get().playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  updatedAt: Date.now(),
                  slots: p.slots.filter((s) => s.id !== playlistSlotId),
                }
              : p,
          ),
        });
      },

      moveTrack: (playlistId, fromIndex, toIndex) => {
        set({
          playlists: get().playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  updatedAt: Date.now(),
                  slots: moveItem(p.slots, fromIndex, toIndex),
                }
              : p,
          ),
        });
      },

      linkWithNext: (playlistId, slotId) => {
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const idx = p.slots.findIndex((s) => s.id === slotId);
            if (idx < 0 || idx >= p.slots.length - 1) return p;

            const now = Date.now();
            const nextSlots = p.slots.slice();
            const curr = nextSlots[idx];
            const nxt = nextSlots[idx + 1];
            const groupId = curr.linkGroupId || nxt.linkGroupId || safeUUID();

            const currOrder =
              typeof curr.chainOrder === "number" ? curr.chainOrder : idx;
            const nextOrder =
              typeof nxt.chainOrder === "number" ? nxt.chainOrder : idx + 1;
            nextSlots[idx] = {
              ...curr,
              linkGroupId: groupId,
              chainOrder: currOrder,
              updatedAt: now,
            };
            nextSlots[idx + 1] = {
              ...nxt,
              linkGroupId: groupId,
              chainOrder: nextOrder,
              updatedAt: now,
            };

            return { ...p, updatedAt: now, slots: nextSlots };
          }),
        });
      },

      unlinkSlot: (playlistId, slotId) => {
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const idx = p.slots.findIndex((s) => s.id === slotId);
            if (idx < 0) return p;
            const groupId = p.slots[idx].linkGroupId;
            if (!groupId) return p;

            const now = Date.now();
            const nextSlots = p.slots.slice();
            nextSlots[idx] = {
              ...nextSlots[idx],
              linkGroupId: undefined,
              chainOrder: undefined,
              updatedAt: now,
            };

            // If only one linked slot remains in this group, unlink it too.
            const remaining = nextSlots.filter((s) => s.linkGroupId === groupId);
            if (remaining.length <= 1) {
              for (let i = 0; i < nextSlots.length; i++) {
                if (nextSlots[i].linkGroupId === groupId) {
                  nextSlots[i] = {
                    ...nextSlots[i],
                    linkGroupId: undefined,
                    chainOrder: undefined,
                    updatedAt: now,
                  };
                }
              }
            }

            return { ...p, updatedAt: now, slots: nextSlots };
          }),
        });
      },

      setChain: (playlistId, slotIds) => {
        const unique = Array.from(new Set(slotIds.filter(Boolean)));
        if (unique.length < 2) return;

        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== playlistId) return p;

            const now = Date.now();
            const selected = new Set(unique);
            const nextSlots = p.slots.slice();
            const idToOriginalIndex = new Map<string, number>();
            nextSlots.forEach((slot, idx) => idToOriginalIndex.set(slot.id, idx));
            const affectedGroups = new Set<string>();

            // Detach selected slots from any existing chains first.
            for (let i = 0; i < nextSlots.length; i++) {
              const slot = nextSlots[i];
              if (!selected.has(slot.id)) continue;
              if (slot.linkGroupId) affectedGroups.add(slot.linkGroupId);
              nextSlots[i] = {
                ...slot,
                linkGroupId: undefined,
                chainOrder: undefined,
                updatedAt: now,
              };
            }

            // Clean up orphaned single-slot chains in affected groups.
            for (const groupId of affectedGroups) {
              const remainingIdx = nextSlots
                .map((slot, idx) => ({ slot, idx }))
                .filter((x) => x.slot.linkGroupId === groupId)
                .map((x) => x.idx);

              if (remainingIdx.length <= 1) {
                for (const idx of remainingIdx) {
                  nextSlots[idx] = {
                    ...nextSlots[idx],
                    linkGroupId: undefined,
                    chainOrder: undefined,
                    updatedAt: now,
                  };
                }
              }
            }

            const groupId = safeUUID();
            const orderedExisting = unique.filter((slotId) =>
              nextSlots.some((s) => s.id === slotId),
            );
            if (orderedExisting.length < 2) return p;

            orderedExisting.forEach((slotId, order) => {
              const idx = nextSlots.findIndex((s) => s.id === slotId);
              if (idx < 0) return;
              nextSlots[idx] = {
                ...nextSlots[idx],
                linkGroupId: groupId,
                chainOrder: order,
                updatedAt: now,
              };
            });

            // Keep chain songs contiguous and in chain order in the visible playlist.
            const chainSlots = orderedExisting
              .map((slotId) => nextSlots.find((s) => s.id === slotId))
              .filter((slot): slot is PlaylistSlot => Boolean(slot));
            const remaining = nextSlots.filter((s) => !selected.has(s.id));

            const anchorOrigIndex =
              idToOriginalIndex.get(orderedExisting[0]) ??
              Math.min(
                ...orderedExisting
                  .map((slotId) => idToOriginalIndex.get(slotId))
                  .filter((v): v is number => typeof v === "number"),
              );
            const insertAt = remaining.findIndex((slot) => {
              const orig = idToOriginalIndex.get(slot.id);
              return typeof orig === "number" && orig >= anchorOrigIndex;
            });

            const reordered =
              insertAt < 0
                ? remaining.concat(chainSlots)
                : [
                    ...remaining.slice(0, insertAt),
                    ...chainSlots,
                    ...remaining.slice(insertAt),
                  ];

            return { ...p, updatedAt: now, slots: reordered };
          }),
        });
      },

      snapChain: (playlistId, groupId) => {
        if (!groupId) return;
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const now = Date.now();
            let touched = false;
            const nextSlots = p.slots.map((slot) => {
              if (slot.linkGroupId !== groupId) return slot;
              touched = true;
              return {
                ...slot,
                linkGroupId: undefined,
                chainOrder: undefined,
                updatedAt: now,
              };
            });
            if (!touched) return p;
            return { ...p, updatedAt: now, slots: nextSlots };
          }),
        });
      },
    }),
    {
      name: "kglw.playlists.v1",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist user playlists only. Prebuilt entries are reconstructed/synced.
        playlists: state.playlists.filter((p) => !isPrebuiltPlaylist(p)),
        dismissedPrebuiltNames: state.dismissedPrebuiltNames,
      }),
      merge: (persisted: unknown, current: PlaylistsState): PlaylistsState => {
        const data = (persisted || {}) as {
          playlists?: LegacyPlaylist[];
          dismissedPrebuiltNames?: string[];
        };
        const persistedPlaylists = Array.isArray(data.playlists)
          ? data.playlists.map(migratePlaylist)
          : [];
        const userPlaylists = persistedPlaylists.filter((p) => !isPrebuiltPlaylist(p));
        const seededPrebuilt = current.playlists.filter((p) => isPrebuiltPlaylist(p));
        const dismissedPrebuiltNames = Array.isArray(data.dismissedPrebuiltNames)
          ? Array.from(
              new Set(
                data.dismissedPrebuiltNames
                  .map((v) => String(v || "").trim().toLowerCase())
                  .filter(Boolean),
              ),
            )
          : current.dismissedPrebuiltNames;
        return {
          ...current,
          playlists: [...seededPrebuilt, ...userPlaylists],
          dismissedPrebuiltNames,
        };
      },
      migrate: (persisted: unknown) => {
        const data = (persisted || {}) as {
          playlists?: LegacyPlaylist[];
          dismissedPrebuiltNames?: string[];
        };
        const hasPersistedPlaylistsField =
          data &&
          typeof data === "object" &&
          Object.prototype.hasOwnProperty.call(data, "playlists");
        const playlists = Array.isArray(data.playlists) ? data.playlists : [];
        const dismissedPrebuiltNames = Array.isArray(data.dismissedPrebuiltNames)
          ? data.dismissedPrebuiltNames.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
          : [];
        if (!hasPersistedPlaylistsField) {
          return {
            playlists: buildStaticPrebuiltSeedPlaylists(),
            dismissedPrebuiltNames: [],
          };
        }
        return {
          playlists: playlists.map(migratePlaylist).filter((p) => !isPrebuiltPlaylist(p)),
          dismissedPrebuiltNames: Array.from(new Set(dismissedPrebuiltNames)),
        };
      },
    },
  ),
);
