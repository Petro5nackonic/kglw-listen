"use client";

import { useEffect } from "react";

import { usePlaylists } from "@/components/playlists/store";

export function PrebuiltPlaylistsSync() {
  const syncPrebuiltPlaylistsFromServer = usePlaylists((s) => s.syncPrebuiltPlaylistsFromServer);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void syncPrebuiltPlaylistsFromServer();
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [syncPrebuiltPlaylistsFromServer]);

  return null;
}
