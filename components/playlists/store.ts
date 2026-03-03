import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Track } from "@/components/player/store";
import type { Playlist, PlaylistSlot } from "@/components/playlists/types";
import { moveItem, safeUUID } from "@/components/playlists/utils";
import { toDisplayTrackTitle } from "@/utils/displayTitle";

type PlaylistsState = {
  playlists: Playlist[];
  createPlaylist: (name: string) => string;
  createDemoPlaylist: () => string;
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
  tracks?: LegacyPlaylistTrack[];
  slots?: Playlist["slots"];
};

function migratePlaylist(raw: LegacyPlaylist): Playlist {
  if (Array.isArray(raw.slots)) {
    return {
      id: raw.id,
      name: raw.name,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
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
    slots,
  };
}

export const usePlaylists = create<PlaylistsState>()(
  persist(
    (set, get) => ({
      playlists: [],

      createPlaylist: (name) => {
        const normalized = normalizeName(name);
        const id = safeUUID();
        const now = Date.now();

        const playlist: Playlist = {
          id,
          name: normalized || "New playlist",
          createdAt: now,
          updatedAt: now,
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
        set({ playlists: get().playlists.filter((p) => p.id !== playlistId) });
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ playlists: state.playlists }),
      migrate: (persisted: unknown) => {
        const data = (persisted || {}) as {
          playlists?: LegacyPlaylist[];
        };
        const playlists = Array.isArray(data.playlists) ? data.playlists : [];
        return {
          playlists: playlists.map(migratePlaylist),
        };
      },
    },
  ),
);
