import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Track } from "@/components/player/store";
import type { Playlist } from "@/components/playlists/types";
import { moveItem, safeUUID } from "@/components/playlists/utils";

type PlaylistsState = {
  playlists: Playlist[];
  createPlaylist: (name: string) => string;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;

  addTrack: (playlistId: string, track: Track) => void;
  removeTrack: (playlistId: string, playlistTrackId: string) => void;
  moveTrack: (playlistId: string, fromIndex: number, toIndex: number) => void;
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
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
          tracks: [],
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
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== playlistId) return p;

            // Keep it boring: prevent exact duplicates by URL.
            const already = p.tracks.some((t) => t.track.url === track.url);
            if (already) return p;

            const now = Date.now();
            return {
              ...p,
              updatedAt: now,
              tracks: p.tracks.concat({
                id: safeUUID(),
                addedAt: now,
                track,
              }),
            };
          }),
        });
      },

      removeTrack: (playlistId, playlistTrackId) => {
        set({
          playlists: get().playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  updatedAt: Date.now(),
                  tracks: p.tracks.filter((t) => t.id !== playlistTrackId),
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
                  tracks: moveItem(p.tracks, fromIndex, toIndex),
                }
              : p,
          ),
        });
      },
    }),
    {
      name: "kglw.playlists.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ playlists: state.playlists }),
    },
  ),
);
