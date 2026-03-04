"use client";

import { useEffect } from "react";

import { usePlaylists } from "@/components/playlists/store";

export function PrebuiltPlaylistsSync() {
  const playlists = usePlaylists((s) => s.playlists);
  const syncPrebuiltPlaylistsFromServer = usePlaylists((s) => s.syncPrebuiltPlaylistsFromServer);
  const ensureFlightB741Playlist = usePlaylists((s) => s.ensureFlightB741Playlist);
  const ensureMindFuzzLiveCompPlaylist = usePlaylists((s) => s.ensureMindFuzzLiveCompPlaylist);
  const ensureRequestedAlbumPlaylists = usePlaylists((s) => s.ensureRequestedAlbumPlaylists);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void syncPrebuiltPlaylistsFromServer();
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [syncPrebuiltPlaylistsFromServer]);

  useEffect(() => {
    const hasPlaceholderPrebuilt = playlists.some(
      (p) =>
        p.source === "prebuilt" &&
        p.slots.length > 0 &&
        p.slots.every((slot) =>
          slot.variants.every((variant) => !String(variant.track.url || "").trim()),
        ),
    );
    if (!hasPlaceholderPrebuilt) return;
    const timeout = window.setTimeout(() => {
      void syncPrebuiltPlaylistsFromServer();
      // Safety net: if API sync is slow/unavailable, materialize real variants client-side.
      void ensureFlightB741Playlist();
      void ensureMindFuzzLiveCompPlaylist();
      void ensureRequestedAlbumPlaylists();
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [
    playlists,
    syncPrebuiltPlaylistsFromServer,
    ensureFlightB741Playlist,
    ensureMindFuzzLiveCompPlaylist,
    ensureRequestedAlbumPlaylists,
  ]);

  return null;
}
