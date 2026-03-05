"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { CreatePlaylistForm } from "@/components/playlists/CreatePlaylistForm";
import { usePlaylists } from "@/components/playlists/store";

const DEFAULT_ARTWORK_SRC = "/api/default-artwork";

function getArchiveIdentifier(url?: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIdx = parts.findIndex((p) => /^(download|details|metadata)$/i.test(p));
    if (markerIdx >= 0 && parts[markerIdx + 1]) {
      return decodeURIComponent(parts[markerIdx + 1]);
    }
  } catch {
    // fall back to regex parsing below
  }
  const match = raw.match(/\/(?:download|details|metadata)\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function trackThumb(url?: string, artwork?: string): string {
  const fromArtwork = String(artwork || "").trim();
  if (fromArtwork) return fromArtwork;
  const id = getArchiveIdentifier(url);
  if (!id) return DEFAULT_ARTWORK_SRC;
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

export default function PlaylistsPage() {
  const router = useRouter();

  const playlists = usePlaylists((s) => s.playlists);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);
  const createDemoPlaylist = usePlaylists((s) => s.createDemoPlaylist);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);

  const prebuiltPlaylists = useMemo(
    () => playlists.filter((p) => p.source === "prebuilt"),
    [playlists],
  );
  const userPlaylists = useMemo(
    () => playlists.filter((p) => p.source !== "prebuilt"),
    [playlists],
  );

  return (
    <main className="min-h-screen bg-[#080017] text-white">
      <div className="relative h-[170px] w-full overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-[#17003a] via-[#110028] to-[#080017]" />
        <div className="absolute inset-x-0 top-0 mx-auto w-full max-w-md px-6 pt-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-white/80 hover:text-white text-lg">
              ←
            </Link>
            <span className="text-xs tracking-[0.24em] text-white/55 uppercase">
              Setlist
            </span>
          </div>
          <div className="mt-5 text-center">
            <div className="text-[28px] font-medium tracking-tight">Playlists</div>
            <div className="mt-1 text-sm text-white/65">
              {playlists.length} saved list{playlists.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-3 max-w-md px-6 pb-8">
        <section className="mb-4 rounded-2xl border border-white/20 bg-white/6 p-4 backdrop-blur">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Create playlist
          </div>
          <CreatePlaylistForm
            onCreate={(name) => {
              const id = createPlaylist(name);
              router.push(`/playlists/${id}`);
            }}
          />
          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-2.5 text-sm text-fuchsia-100 hover:bg-fuchsia-500/25 transition"
            onClick={() => {
              const id = createDemoPlaylist();
              router.push(`/playlists/${id}`);
            }}
          >
            Create demo fused playlist
          </button>
        </section>

        <section className="rounded-2xl border border-white/20 bg-white/4 p-2 backdrop-blur">
          <div className="px-2 pb-2 pt-1 text-sm text-white/70">
            {prebuiltPlaylists.length > 0 ? "Pre-built playlists" : "Your playlists"}
          </div>

          {playlists.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-white/65">
              No playlists yet. Create one above.
            </div>
          ) : (
            <div className="space-y-2">
              {prebuiltPlaylists.map((p) => {
                const previewThumbs = p.slots
                  .flatMap((slot) => slot.variants.map((v) => v.track))
                  .slice(0, 4)
                  .map((t) => trackThumb(t.url, t.artwork));
                while (previewThumbs.length < 4) previewThumbs.push(DEFAULT_ARTWORK_SRC);
                const versionsCount = p.slots.reduce((sum, s) => sum + s.variants.length, 0);
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820] px-3 py-3 shadow-[0_8px_24px_rgba(90,34,201,0.25)]"
                  >
                    <div className="mb-2 inline-flex rounded-full border border-[#8f68dd]/60 bg-[#5A22C9]/20 px-2 py-1 text-[10px] tracking-[0.16em] text-[#d8c3ff] uppercase">
                      Pre-built live comp
                    </div>
                    <div className="mb-3 grid w-20 grid-cols-2 gap-1.5">
                      {previewThumbs.map((src, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${p.id}-thumb-${idx}`}
                          src={src}
                          alt=""
                          className="aspect-square w-full rounded-[8px] border border-white/15 object-cover"
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/playlists/${p.id}`}
                          className="block truncate text-[15px] font-medium text-white hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-1 text-xs text-white/65">
                          {p.slots.length} track{p.slots.length === 1 ? "" : "s"} • {versionsCount} version
                          {versionsCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={`/playlists/${p.id}`}
                          className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/15 transition"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:border-white/30 hover:text-white transition"
                          onClick={() => {
                            if (!confirm(`Delete playlist "${p.name}"?`)) return;
                            deletePlaylist(p.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {userPlaylists.length > 0 && prebuiltPlaylists.length > 0 ? (
                <div className="px-2 pt-2 text-[11px] tracking-[0.16em] text-white/45 uppercase">
                  Your playlists
                </div>
              ) : null}
              {userPlaylists.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-white/15 bg-black/20 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/playlists/${p.id}`}
                        className="block truncate text-[15px] font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="mt-1 text-xs text-white/55">
                        {p.slots.length} track{p.slots.length === 1 ? "" : "s"} •{" "}
                        {p.slots.reduce((sum, s) => sum + s.variants.length, 0)} version
                        {p.slots.reduce((sum, s) => sum + s.variants.length, 0) === 1
                          ? ""
                          : "s"}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/playlists/${p.id}`}
                        className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-white/90 hover:bg-white/15 transition"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:border-white/30 hover:text-white transition"
                        onClick={() => {
                          if (!confirm(`Delete playlist "${p.name}"?`)) return;
                          deletePlaylist(p.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
