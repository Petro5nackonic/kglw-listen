"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faChevronDown,
  faCirclePlay,
  faEllipsisVertical,
  faPaperPlane,
  faPen,
  faPlus,
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

const PLAYLIST_SORT_OPTIONS = [
  { value: "date_added", label: "Date Added" },
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title" },
  { value: "duration", label: "Duration" },
] as const;

type PlaylistSortValue = (typeof PLAYLIST_SORT_OPTIONS)[number]["value"];
const LOVED_SONGS_PLAYLIST_NAME = "Loved Songs";

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
  const [sortBy, setSortBy] = useState<PlaylistSortValue>("date_added");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [showCreatePlaylistDialog, setShowCreatePlaylistDialog] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);

  const userPlaylists = useMemo(
    () => playlists.filter((p) => p.source !== "prebuilt"),
    [playlists],
  );
  const selectedSet = useMemo(() => new Set(selectedPlaylistIds), [selectedPlaylistIds]);
  const sortLabel = useMemo(
    () => PLAYLIST_SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label || "Date Added",
    [sortBy],
  );
  const playlistRows = useMemo(() => {
    const rows = userPlaylists.map((p) => {
      const versions = p.slots.reduce((sum, slot) => sum + slot.variants.length, 0);
      const chainCount = new Set(p.slots.map((s) => s.linkGroupId).filter(Boolean)).size;
      const totalSeconds = p.slots.reduce(
        (sum, slot) => sum + (parseLengthToSeconds(slot.variants[0]?.track.length) ?? 0),
        0,
      );
      return {
        playlist: p,
        versions,
        chainCount,
        totalSeconds,
        duration: formatShowLength(totalSeconds),
      };
    });
    return rows.sort((a, b) => {
      if (sortBy === "title") return a.playlist.name.localeCompare(b.playlist.name);
      if (sortBy === "updated") return b.playlist.updatedAt - a.playlist.updatedAt;
      if (sortBy === "duration") {
        if (b.totalSeconds !== a.totalSeconds) return b.totalSeconds - a.totalSeconds;
        return a.playlist.name.localeCompare(b.playlist.name);
      }
      return b.playlist.createdAt - a.playlist.createdAt;
    });
  }, [userPlaylists, sortBy]);

  useEffect(() => {
    setClientHydrated(true);
  }, []);
  useEffect(() => {
    if (!clientHydrated) return;
    const hasLovedSongs = playlists.some(
      (p) => p.name.trim().toLowerCase() === LOVED_SONGS_PLAYLIST_NAME.toLowerCase(),
    );
    if (hasLovedSongs) return;
    createPlaylist(LOVED_SONGS_PLAYLIST_NAME);
  }, [clientHydrated, playlists, createPlaylist]);
  useEffect(() => {
    if (!playerLoading) setRequestedPlaylistId(null);
  }, [playerLoading]);
  useEffect(() => {
    setSelectedPlaylistIds((prev) =>
      prev.filter((id) => userPlaylists.some((playlist) => playlist.id === id)),
    );
  }, [userPlaylists]);

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
  function toggleSelectPlaylist(playlistId: string) {
    setSelectedPlaylistIds((prev) =>
      prev.includes(playlistId)
        ? prev.filter((id) => id !== playlistId)
        : [...prev, playlistId],
    );
  }

  function openCreatePlaylistDialog() {
    const suggested = nextDefaultPlaylistName(playlists.map((pl) => pl.name));
    setNewPlaylistName(suggested);
    setShowCreatePlaylistDialog(true);
  }

  function createAndOpenPlaylist() {
    const nextName = newPlaylistName.trim() || nextDefaultPlaylistName(playlists.map((pl) => pl.name));
    const id = createPlaylist(nextName);
    setShowCreatePlaylistDialog(false);
    router.push(`/playlists/${encodeURIComponent(id)}`);
  }

  return (
    <main className="min-h-screen bg-[#080017] text-white">
      <div className="mx-auto w-full max-w-md px-6 pb-8 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-semibold [font-family:var(--font-roboto-condensed)]">
              Playlists
            </h1>
            {userPlaylists.length > 0 ? (
              <div className="relative z-20">
                <button
                  id="playlist-sort"
                  type="button"
                  aria-label="Sort playlists"
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen}
                  className="inline-flex items-center gap-2 rounded-full border border-white px-3 py-2 text-[12px] text-white"
                  onClick={() => {
                    setSortMenuOpen((v) => !v);
                    setPageMenuOpen(false);
                  }}
                >
                  <span>{sortLabel}</span>
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
                {sortMenuOpen && (
                  <div className="absolute left-0 top-9 z-30 w-44 rounded-[12px] border border-white/15 bg-[#16052c] p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
                    {PLAYLIST_SORT_OPTIONS.map((opt) => {
                      const active = sortBy === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`flex w-full items-center rounded-[10px] px-2.5 py-2 text-left text-[14px] [font-family:var(--font-roboto-condensed)] ${
                            active ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10"
                          }`}
                          onClick={() => {
                            setSortBy(opt.value);
                            setSortMenuOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Create playlist"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white text-[14px] text-white"
              onClick={openCreatePlaylistDialog}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
            <div className="relative z-20">
              <button
                type="button"
                aria-label="Playlist page options"
                className="text-[20px] text-white/90"
                onClick={() => {
                  setPageMenuOpen((v) => !v);
                  setSortMenuOpen(false);
                }}
              >
                <FontAwesomeIcon icon={faEllipsisVertical} />
              </button>
              {pageMenuOpen && (
                <div className="absolute right-0 top-9 z-30 w-40 rounded-[12px] border border-white/15 bg-[#16052c] p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
                  <button
                    type="button"
                    disabled={userPlaylists.length === 0}
                    className="flex w-full items-center rounded-[10px] px-2.5 py-2 text-left text-[14px] text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 [font-family:var(--font-roboto-condensed)]"
                    onClick={() => {
                      if (userPlaylists.length === 0) return;
                      setEditMode((prev) => !prev);
                      setSelectedPlaylistIds([]);
                      setPlaylistMenuId(null);
                      setPageMenuOpen(false);
                    }}
                  >
                    {editMode ? "Done editing" : "Edit"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {userPlaylists.length === 0 ? (
          <div className="flex min-h-[calc(100vh-130px)] flex-col items-center justify-center gap-3 text-center">
            <div className="text-[18px] text-white/80 [font-family:var(--font-roboto-condensed)]">
              Create your first playlist!
            </div>
            <button
              type="button"
              className="mx-auto inline-flex w-fit items-center justify-center rounded-[16px] border-2 border-[#5a22c9] bg-[#5a22c9] px-6 py-3 text-white transition hover:bg-[#6a33d9]"
              onClick={openCreatePlaylistDialog}
            >
              <div className="text-[18px] font-medium text-white [font-family:var(--font-roboto-condensed)]">
                Create a playlist
              </div>
            </button>
          </div>
        ) : (
          <section>
            {(sortMenuOpen || pageMenuOpen) && (
              <button
                type="button"
                aria-label="Close menus"
                className="fixed inset-0 z-10"
                onClick={() => {
                  setSortMenuOpen(false);
                  setPageMenuOpen(false);
                }}
              />
            )}
            {playlistMenuId && (
              <button
                type="button"
                aria-label="Close playlist menu"
                className="fixed inset-0 z-[70]"
                onClick={() => setPlaylistMenuId(null)}
              />
            )}

            <div className="space-y-2 text-left">
              {playlistRows.map(({ playlist: p, versions, chainCount, duration }) => {
                const isLovedSongs =
                  p.name.trim().toLowerCase() === LOVED_SONGS_PLAYLIST_NAME.toLowerCase();
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-[16px] p-3 backdrop-blur-[6px] ${
                      isLovedSongs
                        ? "border border-[#7c50d8]/65 bg-linear-to-br from-[#1b0d33] via-[#180b2d] to-[#0f0820]"
                        : "border border-white/20 bg-white/5"
                    } ${
                      playlistMenuId === p.id ? "z-[90]" : "z-0"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {editMode ? (
                          <button
                            type="button"
                            aria-label={selectedSet.has(p.id) ? `Deselect ${p.name}` : `Select ${p.name}`}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              selectedSet.has(p.id)
                                ? "border-rose-400 bg-rose-500 text-white"
                                : "border-white/45 text-transparent"
                            }`}
                            onClick={() => toggleSelectPlaylist(p.id)}
                          >
                            <FontAwesomeIcon icon={faCheck} className="text-[11px]" />
                          </button>
                        ) : null}
                        {editMode ? (
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => toggleSelectPlaylist(p.id)}
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
                          </button>
                        ) : (
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
                        )}
                      </div>
                      {!editMode ? (
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
                      ) : null}
                    </div>
                    {!editMode && playlistMenuId === p.id && (
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
            {editMode && selectedPlaylistIds.length > 0 ? (
              <div className="pointer-events-none fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[96] px-6">
                <div className="mx-auto w-full max-w-md">
                  <button
                    type="button"
                    className="pointer-events-auto w-full rounded-[14px] bg-rose-600 px-4 py-3 text-[14px] font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.35)] hover:bg-rose-500"
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete ${selectedPlaylistIds.length} selected playlist${
                            selectedPlaylistIds.length === 1 ? "" : "s"
                          }?`,
                        )
                      ) {
                        return;
                      }
                      for (const id of selectedPlaylistIds) {
                        deletePlaylist(id);
                      }
                      setSelectedPlaylistIds([]);
                      setEditMode(false);
                    }}
                  >
                    Delete {selectedPlaylistIds.length} selected
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>

      {showCreatePlaylistDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-6"
          onClick={() => setShowCreatePlaylistDialog(false)}
        >
          <div
            className="w-full max-w-[361px] rounded-xl border border-white/15 bg-[#120326] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-medium">Create new playlist</div>
            <div className="mt-1 text-xs text-white/65">
              Name your playlist.
            </div>

            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="New playlist"
              maxLength={60}
              autoFocus
              className="mt-3 w-full rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/45"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-sm hover:bg-white/12 transition"
                onClick={() => setShowCreatePlaylistDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-fuchsia-300/45 bg-fuchsia-500/20 px-3 py-2 text-sm hover:bg-fuchsia-500/30 transition"
                onClick={createAndOpenPlaylist}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
