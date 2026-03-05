"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlay,
  faEllipsisVertical,
  faPaperPlane,
  faPen,
  faSpinner,
  faTrash,
} from "@fortawesome/pro-solid-svg-icons";

import { usePlayer, type Track } from "@/components/player/store";
import { usePlaylists } from "@/components/playlists/store";
import { logPlayedPlaylist } from "@/utils/activityFeed";

function nextDefaultPlaylistName(existingNames: string[]): string {
  const base = "My Playlist";
  const normalized = new Set(
    existingNames
      .map((name) => String(name || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (!normalized.has(base.toLowerCase())) return base;
  let n = 2;
  while (normalized.has(`${base.toLowerCase()} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function formatShowLength(sec?: number | null): string {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return "";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function parseLengthToSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return null;
}

function isAudioName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.endsWith(".mp3") ||
    n.endsWith(".flac") ||
    n.endsWith(".ogg") ||
    n.endsWith(".m4a") ||
    n.endsWith(".wav")
  );
}

function audioExtRank(name: string): number {
  const n = name.toLowerCase();
  if (n.endsWith(".flac")) return 1;
  if (n.endsWith(".mp3")) return 2;
  if (n.endsWith(".m4a")) return 3;
  if (n.endsWith(".ogg")) return 4;
  if (n.endsWith(".wav")) return 5;
  return 999;
}

function trackSetRank(fileName: string): number {
  const n = fileName.toLowerCase();
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;
  if (n.includes("audience") || n.includes("matrix") || n.includes("soundboard")) return 3;
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (n.includes("4ch") || n.includes("4-ch") || n.includes("4 channel") || n.includes("4-channel")) {
    return 12;
  }
  return 5;
}

function parseTrackNum(t?: string): number {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

export default function PlaylistsPage() {
  const router = useRouter();
  const setQueue = usePlayer((s) => s.setQueue);
  const playerLoading = usePlayer((s) => s.loading);
  const playlists = usePlaylists((s) => s.playlists);
  const createPlaylist = usePlaylists((s) => s.createPlaylist);
  const renamePlaylist = usePlaylists((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);
  const [playlistMenuId, setPlaylistMenuId] = useState<string | null>(null);
  const [requestedPlaylistId, setRequestedPlaylistId] = useState<string | null>(null);
  const [clientHydrated, setClientHydrated] = useState(false);

  const userPlaylists = useMemo(
    () => playlists.filter((p) => p.source !== "prebuilt"),
    [playlists],
  );

  useEffect(() => {
    setClientHydrated(true);
  }, []);
  useEffect(() => {
    if (!playerLoading) setRequestedPlaylistId(null);
  }, [playerLoading]);

  async function playPlaylist(playlistId: string) {
    const playlist = userPlaylists.find((p) => p.id === playlistId);
    if (!playlist) return;
    const queue: Track[] = playlist.slots
      .map((slot) => {
        const playable = slot.variants
          .map((v) => v.track)
          .filter((track) => Boolean(String(track?.url || "").trim()))
          .filter((track) => isAudioName(String(track.url || "")))
          .slice()
          .sort((a, b) => {
            const setDiff = trackSetRank(String(a.name || a.url || "")) - trackSetRank(String(b.name || b.url || ""));
            if (setDiff !== 0) return setDiff;
            const extDiff = audioExtRank(String(a.name || a.url || "")) - audioExtRank(String(b.name || b.url || ""));
            if (extDiff !== 0) return extDiff;
            const trackDiff = parseTrackNum(a.track) - parseTrackNum(b.track);
            if (trackDiff !== 0) return trackDiff;
            return String(a.title || "").localeCompare(String(b.title || ""));
          });
        return playable[0] || null;
      })
      .filter((track): track is Track => Boolean(track?.url));
    if (queue.length === 0) return;
    setQueue(queue, 0);
    logPlayedPlaylist({ playlistId, playlistName: playlist.name });
  }

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
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-3 max-w-md px-6 pb-8">
        {userPlaylists.length === 0 ? (
          <div className="flex min-h-[calc(100vh-190px)] flex-col items-center justify-center gap-3 text-center">
            <div className="text-[18px] text-white/80 [font-family:var(--font-roboto-condensed)]">
              Create your first playlist!
            </div>
            <button
              type="button"
              className="mx-auto inline-flex w-fit items-center justify-center rounded-[16px] border-2 border-[#5a22c9] bg-[#5a22c9] px-6 py-3 text-white transition hover:bg-[#6a33d9]"
              onClick={() => {
                const suggested = nextDefaultPlaylistName(playlists.map((pl) => pl.name));
                const id = createPlaylist(suggested);
                router.push(
                  `/playlists/${encodeURIComponent(id)}?rename=1&suggested=${encodeURIComponent(suggested)}`,
                );
              }}
            >
              <div className="text-[18px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                Create a playlist
              </div>
            </button>
          </div>
        ) : (
          <section>
            {playlistMenuId && (
              <button
                type="button"
                aria-label="Close playlist menu"
                className="fixed inset-0 z-[70]"
                onClick={() => setPlaylistMenuId(null)}
              />
            )}

            <div className="space-y-2 text-left">
              {userPlaylists.map((p) => {
                const versions = p.slots.reduce((sum, slot) => sum + slot.variants.length, 0);
                const chainCount = new Set(p.slots.map((s) => s.linkGroupId).filter(Boolean)).size;
                const totalSeconds = p.slots.reduce(
                  (sum, slot) => sum + (parseLengthToSeconds(slot.variants[0]?.track.length) ?? 0),
                  0,
                );
                const duration = formatShowLength(totalSeconds);
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-[16px] border border-white/20 bg-white/5 p-3 backdrop-blur-[6px] ${
                      playlistMenuId === p.id ? "z-[90]" : "z-0"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Link
                          href={clientHydrated ? `/playlists/${p.id}` : "/playlists"}
                          className="min-w-0 flex-1"
                        >
                          <div className="truncate text-[18px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                            {p.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-[6px] text-[12px] font-medium text-white/70 [font-family:var(--font-roboto-condensed)]">
                            <span>
                              {p.slots.length} Track{p.slots.length === 1 ? "" : "s"}
                            </span>
                            <span className="size-[3px] rounded-full bg-white/60" />
                            <span>
                              {versions} Version{versions === 1 ? "" : "s"}
                            </span>
                            <span className="size-[3px] rounded-full bg-white/60" />
                            <span>
                              {chainCount} Chain{chainCount === 1 ? "" : "s"}
                            </span>
                            {duration ? (
                              <>
                                <span className="size-[3px] rounded-full bg-white/60" />
                                <span>{duration}</span>
                              </>
                            ) : null}
                          </div>
                        </Link>
                      </div>
                      <div className="ml-4 flex shrink-0 items-center gap-4 text-white">
                        <button
                          type="button"
                          aria-label={`Play playlist ${p.name}`}
                          className="text-[26px] text-white"
                          onClick={async () => {
                            setRequestedPlaylistId(p.id);
                            try {
                              await playPlaylist(p.id);
                            } finally {
                              if (!usePlayer.getState().loading) {
                                setRequestedPlaylistId((prev) => (prev === p.id ? null : prev));
                              }
                            }
                          }}
                        >
                          <FontAwesomeIcon
                            icon={requestedPlaylistId === p.id ? faSpinner : faCirclePlay}
                            className={requestedPlaylistId === p.id ? "animate-spin" : ""}
                          />
                        </button>
                        <button
                          type="button"
                          aria-label="Playlist options"
                          className="text-[20px] text-white/90"
                          onClick={() => setPlaylistMenuId((prev) => (prev === p.id ? null : p.id))}
                        >
                          <FontAwesomeIcon icon={faEllipsisVertical} />
                        </button>
                      </div>
                    </div>
                    {playlistMenuId === p.id && (
                      <div className="absolute right-3 top-10 z-[95] w-44 rounded-[12px] border border-white/15 bg-[#16052c] p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-white/90 hover:bg-white/10 [font-family:var(--font-roboto-condensed)]"
                          onClick={async () => {
                            const shareUrl =
                              typeof window !== "undefined"
                                ? `${window.location.origin}/playlists/${p.id}`
                                : "";
                            try {
                              if (!shareUrl) return;
                              await navigator.clipboard.writeText(shareUrl);
                            } catch {
                              // ignore clipboard failures
                            }
                            setPlaylistMenuId(null);
                          }}
                        >
                          <FontAwesomeIcon icon={faPaperPlane} className="text-[12px]" />
                          <span>Share playlist</span>
                        </button>
                        <button
                          type="button"
                          className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-white/90 hover:bg-white/10 [font-family:var(--font-roboto-condensed)]"
                          onClick={() => {
                            const next = prompt("Rename playlist", p.name)?.trim();
                            if (!next) return;
                            renamePlaylist(p.id, next);
                            setPlaylistMenuId(null);
                          }}
                        >
                          <FontAwesomeIcon icon={faPen} className="text-[11px]" />
                          <span>Rename playlist</span>
                        </button>
                        <button
                          type="button"
                          className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-rose-200 hover:bg-rose-500/20 [font-family:var(--font-roboto-condensed)]"
                          onClick={() => {
                            if (!confirm(`Delete playlist "${p.name}"?`)) return;
                            deletePlaylist(p.id);
                            setPlaylistMenuId(null);
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} className="text-[12px]" />
                          <span>Delete playlist</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
