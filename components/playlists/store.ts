import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Track } from "@/components/player/store";
import type { Playlist } from "@/components/playlists/types";
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
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function canonicalTrackTitle(track: Track): string {
  return toDisplayTrackTitle(track.title).toLowerCase().trim();
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
          name: "Demo: Fused + Linked",
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
            const slotIdx = p.slots.findIndex((s) => s.canonicalTitle === canonical);

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

            nextSlots[idx] = { ...curr, linkGroupId: groupId, updatedAt: now };
            nextSlots[idx + 1] = { ...nxt, linkGroupId: groupId, updatedAt: now };

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
            nextSlots[idx] = { ...nextSlots[idx], linkGroupId: undefined, updatedAt: now };

            // If only one linked slot remains in this group, unlink it too.
            const remaining = nextSlots.filter((s) => s.linkGroupId === groupId);
            if (remaining.length <= 1) {
              for (let i = 0; i < nextSlots.length; i++) {
                if (nextSlots[i].linkGroupId === groupId) {
                  nextSlots[i] = {
                    ...nextSlots[i],
                    linkGroupId: undefined,
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
            const affectedGroups = new Set<string>();

            // Detach selected slots from any existing chains first.
            for (let i = 0; i < nextSlots.length; i++) {
              const slot = nextSlots[i];
              if (!selected.has(slot.id)) continue;
              if (slot.linkGroupId) affectedGroups.add(slot.linkGroupId);
              nextSlots[i] = { ...slot, linkGroupId: undefined, updatedAt: now };
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
                    updatedAt: now,
                  };
                }
              }
            }

            const groupId = safeUUID();
            for (let i = 0; i < nextSlots.length; i++) {
              if (!selected.has(nextSlots[i].id)) continue;
              nextSlots[i] = { ...nextSlots[i], linkGroupId: groupId, updatedAt: now };
            }

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
