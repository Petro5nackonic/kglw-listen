"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { usePlayer } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";

export default function PlaylistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const playlistId = params.id;

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const { setQueue } = usePlayer();

  const playlist = usePlaylists((s) =>
    s.playlists.find((p) => p.id === playlistId),
  );
  const renamePlaylist = usePlaylists((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);
  const removeTrack = usePlaylists((s) => s.removeTrack);

  const [draftName, setDraftName] = useState(playlist?.name || "");

  useEffect(() => {
    if (!playlist) return;
    setDraftName(playlist.name);
  }, [playlist?.id, playlist?.name]);

  const queue = useMemo(() => {
    if (!playlist) return [];
    return playlist.tracks.map((t) => t.track);
  }, [playlist]);

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-5">
          <Link
            href="/playlists"
            className="text-sm text-white/70 hover:text-white"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            Loading…
          </h1>
        </header>
      </main>
    );
  }

  if (!playlist) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-5">
          <Link
            href="/playlists"
            className="text-sm text-white/70 hover:text-white"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            Playlist not found
          </h1>
        </header>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          This playlist may have been deleted.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <Link
          href="/playlists"
          className="text-sm text-white/70 hover:text-white"
        >
          ← Back
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          {playlist.name}
        </h1>
      </header>

      <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/70">Rename playlist</div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 transition"
            onClick={() => renamePlaylist(playlist.id, draftName)}
          >
            Save
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 transition disabled:opacity-40"
            disabled={queue.length === 0}
            onClick={() => setQueue(queue, 0)}
          >
            Play
          </button>

          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-white/25 hover:text-white transition"
            onClick={() => {
              if (!confirm(`Delete playlist "${playlist.name}"?`)) return;
              deletePlaylist(playlist.id);
              router.push("/playlists");
            }}
          >
            Delete
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-4">
          <div className="text-sm text-white/70">Tracks</div>
          <div className="text-xs text-white/50">
            {playlist.tracks.length} track(s)
          </div>
        </div>

        {playlist.tracks.length === 0 ? (
          <div className="p-4 text-sm text-white/70">
            Empty playlist. Add tracks from any show.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {playlist.tracks.map((pt, idx) => (
              <div
                key={pt.id}
                className="flex items-center justify-between gap-3 p-4"
              >
                <button
                  type="button"
                  className="min-w-0 text-left hover:underline"
                  onClick={() => setQueue(queue, idx)}
                  title="Play from here"
                >
                  <div className="truncate text-sm">
                    <span className="text-white/50 mr-2">
                      {String(idx + 1).padStart(2, "0")}.
                    </span>
                    {pt.track.title}
                  </div>
                  {pt.track.length ? (
                    <div className="mt-1 text-xs text-white/50">
                      {pt.track.length}
                    </div>
                  ) : null}
                </button>

                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-white/25 hover:text-white transition"
                  onClick={() => removeTrack(playlist.id, pt.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
