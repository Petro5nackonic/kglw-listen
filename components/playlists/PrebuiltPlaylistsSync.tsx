"use client";

import { useEffect, useRef } from "react";

import { usePlaylists } from "@/components/playlists/store";

export function PrebuiltPlaylistsSync() {
  const playlists = usePlaylists((s) => s.playlists);
  const syncPrebuiltPlaylistsFromServer = usePlaylists((s) => s.syncPrebuiltPlaylistsFromServer);
  const didInitialSyncRef = useRef(false);
  const lastRetryAtRef = useRef(0);

  useEffect(() => {
    if (didInitialSyncRef.current) return;
    didInitialSyncRef.current = true;
    void syncPrebuiltPlaylistsFromServer();
  }, [syncPrebuiltPlaylistsFromServer]);

  useEffect(() => {
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
    const now = Date.now();
    if (now - lastRetryAtRef.current < 15000) return;
    lastRetryAtRef.current = now;
    const timeout = window.setTimeout(() => {
      void syncPrebuiltPlaylistsFromServer();
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [playlists, syncPrebuiltPlaylistsFromServer]);

  return null;
}
