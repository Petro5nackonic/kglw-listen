"use client";

import { useMemo, useRef, useState } from "react";

import type { Track } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";

export function AddToPlaylistMenu(props: { track: Track }) {
  const { track } = props;

  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  const playlists = usePlaylists((s) => s.playlists);
  const addTrack = usePlaylists((s) => s.addTrack);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);

  const [newName, setNewName] = useState("");

  const hasPlaylists = playlists.length > 0;

  const title = useMemo(() => {
    const base = track.track ? `${track.track}. ${track.title}` : track.title;
    return base || "Track";
  }, [track]);

  function close() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label="Add to playlist"
        title="Add to playlist"
        className="list-none rounded-full border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm text-white/80 hover:text-white hover:border-white/25 transition select-none"
        onClick={(e) => {
          // Prevent triggering parent row click handlers.
          e.stopPropagation();
        }}
      >
        +
      </summary>

      <div
        className="absolute right-0 z-50 mt-2 w-[16rem] rounded-xl border border-white/15 bg-black/80 backdrop-blur p-2 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1 text-xs text-white/60 truncate" title={title}>
          {title}
        </div>

        {hasPlaylists ? (
          <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-white/10 bg-white/5">
            {playlists.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/5 transition"
                onClick={() => {
                  addTrack(p.id, track);
                  close();
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-1 px-2 py-2 text-sm text-white/70">
            No playlists yet.
          </div>
        )}

        <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2">
          <div className="text-xs text-white/60">New playlist</div>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-2 text-sm text-white placeholder:text-white/40"
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-sm text-white hover:bg-white/15 transition"
              onClick={() => {
                const id = createPlaylist(newName);
                addTrack(id, track);
                setNewName("");
                close();
              }}
            >
              Create
            </button>
          </div>
        </div>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs text-white/70 hover:text-white transition"
            onClick={() => close()}
          >
            Close
          </button>
        </div>
      </div>
    </details>
  );
}
