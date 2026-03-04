"use client";

import { useEffect } from "react";

import { usePlaylists } from "@/components/playlists/store";

export function DefaultPlaylistSeeder() {
  const hasFlightB741 = usePlaylists((s) =>
    s.playlists.some((p) => p.name.trim().toLowerCase() === "flight b741"),
  );
  const ensureFlightB741Playlist = usePlaylists((s) => s.ensureFlightB741Playlist);

  useEffect(() => {
    // Do not compete with initial page data requests.
    if (hasFlightB741) return;
    const run = async () => {
      try {
        await ensureFlightB741Playlist();
      } catch {
        // Never break app rendering because of background seeding.
      }
    };
    const timeout = window.setTimeout(() => {
      void run();
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [ensureFlightB741Playlist, hasFlightB741]);

  return null;
}

