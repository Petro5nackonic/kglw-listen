"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { CreatePlaylistForm } from "@/components/playlists/CreatePlaylistForm";
import { usePlaylists } from "@/components/playlists/store";

export default function PlaylistsPage() {
  const router = useRouter();

  const playlists = usePlaylists((s) => s.playlists);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <Link href="/" className="text-sm text-white/70 hover:text-white">
          ← Back
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Playlists</h1>
      </header>

      <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/70">Create playlist</div>
        <div className="mt-2">
          <CreatePlaylistForm
            onCreate={(name) => {
              const id = createPlaylist(name);
              router.push(`/playlists/${id}`);
            }}
          />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-4">
          <div className="text-sm text-white/70">Your playlists</div>
          <div className="text-xs text-white/50">{playlists.length} total</div>
        </div>

        {playlists.length === 0 ? (
          <div className="p-4 text-sm text-white/70">No playlists yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {playlists.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/playlists/${p.id}`}
                    className="block truncate text-sm hover:underline"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-1 text-xs text-white/50">
                    {p.tracks.length} track(s)
                  </div>
                </div>

                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:border-white/25 hover:text-white transition"
                  onClick={() => {
                    if (!confirm(`Delete playlist "${p.name}"?`)) return;
                    deletePlaylist(p.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
