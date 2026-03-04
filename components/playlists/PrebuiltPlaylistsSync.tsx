"use client";

import { useEffect, useState } from "react";

import { usePlaylists } from "@/components/playlists/store";

function getPersistApi() {
  const maybe = (usePlaylists as unknown as { persist?: unknown }).persist as
    | {
        hasHydrated?: () => boolean;
        onFinishHydration?: (cb: () => void) => () => void;
      }
    | undefined;
  return maybe;
}

export function PrebuiltPlaylistsSync() {
  const playlists = usePlaylists((s) => s.playlists);
  const syncPrebuiltPlaylistsFromServer = usePlaylists((s) => s.syncPrebuiltPlaylistsFromServer);
  const ensureFlightB741Playlist = usePlaylists((s) => s.ensureFlightB741Playlist);
  const ensureMindFuzzLiveCompPlaylist = usePlaylists((s) => s.ensureMindFuzzLiveCompPlaylist);
  const ensureRequestedAlbumPlaylists = usePlaylists((s) => s.ensureRequestedAlbumPlaylists);
  const [hydrated, setHydrated] = useState(() => {
    const persist = getPersistApi();
    return typeof persist?.hasHydrated === "function" ? persist.hasHydrated() : true;
  });

  useEffect(() => {
    const persist = getPersistApi();
    if (!persist) {
      setHydrated(true);
      return;
    }
    if (typeof persist.hasHydrated === "function" && persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    if (typeof persist.onFinishHydration !== "function") {
      setHydrated(true);
      return;
    }
    const unsub = persist.onFinishHydration(() => {
      setHydrated(true);
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      void syncPrebuiltPlaylistsFromServer();
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [hydrated, syncPrebuiltPlaylistsFromServer]);

  useEffect(() => {
    if (!hydrated) return;
    const prebuilt = playlists.filter(
      (p) => p.source === "prebuilt" || p.prebuiltKind === "album-live-comp",
    );
    const hasMissingPrebuilt = prebuilt.length === 0;
    const hasPlaceholderPrebuilt = prebuilt.some(
      (p) =>
        p.slots.length > 0 &&
        p.slots.every((slot) =>
          slot.variants.every((variant) => !String(variant.track.url || "").trim()),
        ),
    );
    if (!hasMissingPrebuilt && !hasPlaceholderPrebuilt) return;
    const timeout = window.setTimeout(() => {
      void syncPrebuiltPlaylistsFromServer();
      // Safety net: if API sync is slow/unavailable, materialize real variants client-side.
      void ensureFlightB741Playlist();
      void ensureMindFuzzLiveCompPlaylist();
      void ensureRequestedAlbumPlaylists();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    playlists,
    syncPrebuiltPlaylistsFromServer,
    ensureFlightB741Playlist,
    ensureMindFuzzLiveCompPlaylist,
    ensureRequestedAlbumPlaylists,
  ]);

  return null;
}
