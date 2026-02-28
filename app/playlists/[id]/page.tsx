"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { usePlayer } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTrackTitle } from "@/utils/displayTitle";

export default function PlaylistDetailPage() {
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const playlistId = Array.isArray(params?.id)
    ? params.id[0] || ""
    : params?.id || "";

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const { setQueue } = usePlayer();

  const playlist = usePlaylists((s) =>
    s.playlists.find((p) => p.id === playlistId),
  );
  const renamePlaylist = usePlaylists((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);
  const removeTrack = usePlaylists((s) => s.removeTrack);
  const linkWithNext = usePlaylists((s) => s.linkWithNext);
  const unlinkSlot = usePlaylists((s) => s.unlinkSlot);

  const [draftName, setDraftName] = useState(playlist?.name || "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!playlist) return;
    setDraftName(playlist.name);
  }, [playlist?.id, playlist?.name]);

  const playableSlots = useMemo(() => {
    if (!playlist) return [] as Array<{ slot: (typeof playlist.slots)[number]; track: NonNullable<(typeof playlist.slots)[number]["variants"][number]>["track"] }>;

    const out: Array<{
      slot: (typeof playlist.slots)[number];
      track: NonNullable<(typeof playlist.slots)[number]["variants"][number]>["track"];
    }> = [];

    for (const slot of playlist.slots) {
      const variants = Array.isArray(slot.variants) ? slot.variants : [];
      if (variants.length === 0) continue;
      const chosen =
        variants.length === 1
          ? variants[0]
          : variants[Math.floor(Math.random() * variants.length)];
      if (!chosen?.track?.url) continue;
      out.push({ slot, track: chosen.track });
    }
    return out;
  }, [playlist]);

  const queue = useMemo(
    () => playableSlots.map((x) => x.track),
    [playableSlots],
  );
  const linkGroups = useMemo(() => {
    if (!playlist) return 0;
    return new Set(
      playlist.slots.map((s) => s.linkGroupId).filter(Boolean),
    ).size;
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
            {playlist.slots.length} track(s) •{" "}
            {playlist.slots.reduce((sum, s) => sum + s.variants.length, 0)} version(s)
            {" • "}
            {linkGroups} link{linkGroups === 1 ? "" : "s"}
          </div>
        </div>

        {playableSlots.length === 0 ? (
          <div className="p-4 text-sm text-white/70">
            Empty playlist. Add tracks from any show.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {playableSlots.map(({ slot }, idx) => (
              <div
                key={slot.id}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-1 flex w-5 justify-center">
                      {slot.linkGroupId ? (
                        <span className="inline-flex items-center gap-1">
                          <span
                            title="Linked song"
                            className="inline-block h-2.5 w-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_0_2px_rgba(192,132,252,0.2)]"
                          />
                          {(idx === 0 ||
                            playableSlots[idx - 1]?.slot.linkGroupId !== slot.linkGroupId) && (
                            <span className="text-[11px] text-fuchsia-300">🔗</span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/15" />
                      )}
                    </div>

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
                        {toDisplayTrackTitle(slot.variants[0]?.track.title || "")}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {slot.variants.length > 1
                          ? `${slot.variants.length} fused versions`
                          : (slot.variants[0]?.track.length || "Single version")}
                      </div>
                    </button>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {idx < playlist.slots.length - 1 && !slot.linkGroupId && (
                      <button
                        type="button"
                        className="rounded-lg border border-fuchsia-400/40 px-2 py-1 text-xs text-fuchsia-200 hover:bg-fuchsia-500/15 transition"
                        onClick={() => linkWithNext(playlist.id, slot.id)}
                        title="Link with next song"
                      >
                        Link next
                      </button>
                    )}
                    {slot.linkGroupId && (
                      <button
                        type="button"
                        className="rounded-lg border border-fuchsia-400/40 px-2 py-1 text-xs text-fuchsia-200 hover:bg-fuchsia-500/15 transition"
                        onClick={() => unlinkSlot(playlist.id, slot.id)}
                        title="Unlink song"
                      >
                        Unlink
                      </button>
                    )}
                    {slot.variants.length > 1 && (
                      <button
                        type="button"
                        className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/80 hover:border-white/25 hover:text-white transition"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [slot.id]: !prev[slot.id],
                          }))
                        }
                      >
                        {expanded[slot.id] ? "Hide versions" : "Show versions"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-white/25 hover:text-white transition"
                      onClick={() => removeTrack(playlist.id, slot.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {expanded[slot.id] && slot.variants.length > 1 && (
                  <div className="mt-3 ml-8 rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="mb-2 text-xs text-white/55">
                      Versions in this fused slot
                    </div>
                    <div className="space-y-1">
                      {slot.variants.map((v, vi) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
                        >
                          <span className="min-w-0 truncate">
                            {vi + 1}. {toDisplayTrackTitle(v.track.title)}
                          </span>
                          <span className="shrink-0 text-white/60">
                            {v.track.length || ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
