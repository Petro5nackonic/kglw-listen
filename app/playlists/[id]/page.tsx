"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import type { Track } from "@/components/player/store";
import { usePlayer } from "@/components/player/store";
import type { PlaylistSlot } from "@/components/playlists/types";
import { usePlaylists } from "@/components/playlists/store";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";
import { formatDuration } from "@/utils/formatDuration";

function parseTrackSeconds(length?: string): number {
  if (!length) return 0;
  const value = String(length).trim();
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.max(0, Math.floor(Number(value)));

  const parts = value.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function getArchiveIdentifier(url?: string): string {
  if (!url) return "";
  const match = String(url).match(/\/download\/([^/]+)\//i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function tryNormalizeShowDate(input: string): string {
  if (!input) return "";

  let m = input.match(/\b((?:19|20)\d{2})[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = input.match(/\b((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  return "";
}

function toUsDateLabel(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[2]}-${m[3]}-${m[1]}`;
}

function buildShowLabel(rawTitle: string, identifier: string): string {
  const baseTitle = toDisplayTitle(rawTitle || identifier).trim();
  const isoDate = tryNormalizeShowDate(rawTitle) || tryNormalizeShowDate(identifier);
  const dateLabel = toUsDateLabel(isoDate);
  const useTitle = baseTitle && !/^kglw$/i.test(baseTitle);

  if (useTitle && dateLabel) return `${baseTitle} - ${dateLabel}`;
  if (useTitle) return baseTitle;
  if (dateLabel) return dateLabel;
  return identifier || "Unknown show";
}

function getTrackShowLabel(
  url: string | undefined,
  showTitleByIdentifier: Record<string, string>,
): string {
  const id = getArchiveIdentifier(url);
  if (!id) return "Unknown show";
  return showTitleByIdentifier[id] || buildShowLabel("", id);
}

type PlayableSlot = { slot: PlaylistSlot; track: Track };
type LinkedTrackItem = PlayableSlot & { idx: number };
type PlaylistRenderItem =
  | { type: "single"; item: LinkedTrackItem }
  | { type: "linked-group"; startIdx: number; groupId: string; items: LinkedTrackItem[] };

function shuffleArray<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildPlaybackIndexOrder(playableSlots: PlayableSlot[], shuffleEnabled: boolean): number[] {
  const groups = new Map<string, number[]>();
  playableSlots.forEach((item, idx) => {
    const groupId = item.slot.linkGroupId;
    if (!groupId) return;
    const list = groups.get(groupId) || [];
    list.push(idx);
    groups.set(groupId, list);
  });

  const blocks: number[][] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < playableSlots.length; i += 1) {
    if (consumed.has(i)) continue;
    const groupId = playableSlots[i].slot.linkGroupId;
    if (!groupId) {
      blocks.push([i]);
      consumed.add(i);
      continue;
    }

    const group = (groups.get(groupId) || []).slice().sort((a, b) => a - b);
    if (group.length < 2) {
      blocks.push([i]);
      consumed.add(i);
      continue;
    }

    blocks.push(group);
    group.forEach((idx) => consumed.add(idx));
  }

  const orderedBlocks = shuffleEnabled ? shuffleArray(blocks) : blocks;
  return orderedBlocks.flat();
}

export default function PlaylistDetailPage() {
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
  const removeTrack = usePlaylists((s) => s.removeTrack);
  const linkWithNext = usePlaylists((s) => s.linkWithNext);
  const unlinkSlot = usePlaylists((s) => s.unlinkSlot);
  const setChain = usePlaylists((s) => s.setChain);
  const [actionSlotId, setActionSlotId] = useState<string | null>(null);
  const [chainPickerOpen, setChainPickerOpen] = useState(false);
  const [chainDraftIds, setChainDraftIds] = useState<string[]>([]);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [showTitleByIdentifier, setShowTitleByIdentifier] = useState<
    Record<string, string>
  >({});

  const playableSlots = useMemo(() => {
    if (!playlist) return [] as PlayableSlot[];

    const out: PlayableSlot[] = [];

    for (const slot of playlist.slots) {
      const variants = Array.isArray(slot.variants) ? slot.variants : [];
      if (variants.length === 0) continue;
      const chosen = variants[0];
      if (!chosen?.track?.url) continue;
      out.push({ slot, track: chosen.track });
    }
    return out;
  }, [playlist]);

  const linkGroups = useMemo(() => {
    if (!playlist) return 0;
    return new Set(
      playlist.slots.map((s) => s.linkGroupId).filter(Boolean),
    ).size;
  }, [playlist]);
  const versionsCount = useMemo(
    () => playlist.slots.reduce((sum, s) => sum + s.variants.length, 0),
    [playlist.slots],
  );
  const totalDurationLabel = useMemo(() => {
    const totalSeconds = playableSlots.reduce(
      (sum, item) => sum + parseTrackSeconds(item.track.length),
      0,
    );
    return formatDuration(totalSeconds) || "0:00";
  }, [playableSlots]);
  const heroImage = useMemo(() => {
    const firstTrackUrl = playableSlots[0]?.track.url;
    const identifier = getArchiveIdentifier(firstTrackUrl);
    if (!identifier) return "";
    return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
  }, [playableSlots]);
  const renderItems = useMemo<PlaylistRenderItem[]>(() => {
    const out: PlaylistRenderItem[] = [];
    let i = 0;

    while (i < playableSlots.length) {
      const current = playableSlots[i];
      const groupId = current?.slot?.linkGroupId;

      if (!groupId) {
        out.push({
          type: "single",
          item: { ...current, idx: i },
        });
        i += 1;
        continue;
      }

      let j = i;
      const grouped: LinkedTrackItem[] = [];
      while (j < playableSlots.length && playableSlots[j].slot.linkGroupId === groupId) {
        grouped.push({ ...playableSlots[j], idx: j });
        j += 1;
      }

      if (grouped.length >= 2) {
        out.push({
          type: "linked-group",
          startIdx: i,
          groupId,
          items: grouped,
        });
      } else {
        out.push({
          type: "single",
          item: grouped[0],
        });
      }
      i = j;
    }

    return out;
  }, [playableSlots]);
  const activeActionItem = useMemo(
    () => playableSlots.find((x) => x.slot.id === actionSlotId) || null,
    [actionSlotId, playableSlots],
  );
  const activeActionIdx = useMemo(
    () => playableSlots.findIndex((x) => x.slot.id === actionSlotId),
    [actionSlotId, playableSlots],
  );
  const activeShowIdentifier = useMemo(
    () => getArchiveIdentifier(activeActionItem?.track.url),
    [activeActionItem],
  );
  const playbackOrder = useMemo(
    () => buildPlaybackIndexOrder(playableSlots, shuffleEnabled),
    [playableSlots, shuffleEnabled],
  );
  const playbackQueue = useMemo(
    () => playbackOrder.map((idx) => playableSlots[idx]?.track).filter(Boolean) as Track[],
    [playbackOrder, playableSlots],
  );

  function playFromIndex(startIdx: number) {
    if (startIdx < 0 || playbackQueue.length === 0) return;
    const startInQueue = playbackOrder.indexOf(startIdx);
    const safeStart = startInQueue >= 0 ? startInQueue : 0;
    setQueue(playbackQueue, safeStart);
  }

  useEffect(() => {
    if (!actionSlotId) return;
    const exists = playableSlots.some((x) => x.slot.id === actionSlotId);
    if (exists) return;
    setActionSlotId(null);
    setChainPickerOpen(false);
    setChainDraftIds([]);
  }, [actionSlotId, playableSlots]);
  useEffect(() => {
    let cancelled = false;
    const identifiers = Array.from(
      new Set(playableSlots.map((x) => getArchiveIdentifier(x.track.url)).filter(Boolean)),
    );
    if (identifiers.length === 0) return;

    const missing = identifiers.filter((id) => !showTitleByIdentifier[id]);
    if (missing.length === 0) return;

    async function load() {
      const updates: Record<string, string> = {};

      await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await fetch(
              `https://archive.org/metadata/${encodeURIComponent(id)}`,
              { cache: "force-cache" },
            );
            if (!res.ok) return;
            const data = (await res.json()) as { metadata?: { title?: string } };
            const rawTitle = data?.metadata?.title || id;
            updates[id] = buildShowLabel(rawTitle, id);
          } catch {
            updates[id] = buildShowLabel("", id);
          }
        }),
      );

      if (cancelled || Object.keys(updates).length === 0) return;
      setShowTitleByIdentifier((prev) => ({ ...prev, ...updates }));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [playableSlots, showTitleByIdentifier]);

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[#080017] text-white">
        <div className="mx-auto max-w-md px-6 py-8">
          <Link
            href="/"
            className="text-sm text-white/70 hover:text-white"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Loading…</h1>
        </div>
      </main>
    );
  }

  if (!playlist) {
    return (
      <main className="min-h-screen bg-[#080017] text-white">
        <div className="mx-auto max-w-md px-6 py-8">
          <Link
            href="/"
            className="text-sm text-white/70 hover:text-white"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            Playlist not found
          </h1>
          <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
            This playlist may have been deleted.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080017] text-white [font-family:var(--font-roboto)]">
      <div className="relative h-[220px] w-full overflow-hidden">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt=""
            className="h-full w-full object-cover opacity-30"
          />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-b from-[#17003a]/65 via-[#110028]/80 to-[#080017]" />
        <div className="absolute inset-x-0 top-0 mx-auto w-full max-w-md px-6 pt-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-white/80 hover:text-white text-lg">
              ←
            </Link>
            <span className="text-xs tracking-[0.24em] text-white/55 uppercase">
              Playlist
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-14 max-w-md px-6 pb-8">
        <section className="mb-5">
          <div className="rounded-t-2xl border border-white/20 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <h1 className="truncate text-[20px] leading-none font-medium tracking-tight">
                {playlist.name}
              </h1>
              <span className="text-xl text-fuchsia-400">♥</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 text-[16px] font-light text-white/80 [font-family:var(--font-roboto-condensed)]">
              <span>
                {playlist.slots.length} Track{playlist.slots.length === 1 ? "" : "s"}
              </span>
              <span className="text-white/45">•</span>
              <span>
                {versionsCount} Version{versionsCount === 1 ? "" : "s"}
              </span>
              <span className="text-white/45">•</span>
              <span>
                {linkGroups} Link{linkGroups === 1 ? "" : "s"}
              </span>
              <span className="text-white/45">•</span>
              <span>{totalDurationLabel}</span>
            </div>
          </div>
        </section>

        <div className="mb-6 flex items-center gap-2">
          <div className="flex flex-1 items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-[14px] text-white/70">Search this playlist</span>
            <span className="text-[18px] text-white/90">⌕</span>
          </div>
          <button
            type="button"
            className={`rounded-2xl border px-3 py-3 text-xs uppercase tracking-[0.12em] transition ${
              shuffleEnabled
                ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-100"
                : "border-white/15 bg-white/5 text-white/70 hover:text-white"
            }`}
            onClick={() => setShuffleEnabled((v) => !v)}
            title="Toggle shuffle for this playlist"
          >
            Shuffle {shuffleEnabled ? "On" : "Off"}
          </button>
        </div>

        {playableSlots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-white/70">
            Empty playlist. Add tracks from any show.
          </div>
        ) : (
          <section className="space-y-4 [font-family:var(--font-roboto-condensed)]">
            {renderItems.map((entry) => {
              if (entry.type === "single") {
                const { slot, track, idx } = entry.item;
                return (
                  <div key={slot.id}>
                    <div className="flex items-start justify-between gap-3 py-0.5">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <div className="mt-1 w-5 shrink-0 text-right text-[14px] font-medium text-white/50">
                          {idx + 1}
                        </div>

                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => playFromIndex(idx)}
                          title="Play from here"
                        >
                          <div className="truncate text-[16px] leading-[1.1]">
                            {toDisplayTrackTitle(slot.variants[0]?.track.title || "")}
                          </div>
                          <div className="mt-1 truncate text-[12px] leading-none text-white/70">
                            {getTrackShowLabel(track.url, showTitleByIdentifier)}
                          </div>
                        </button>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pt-1">
                        {slot.variants.length === 1 && track.length ? (
                          <span className="text-[14px] font-light tracking-[0.04em] text-white">
                            {track.length}
                          </span>
                        ) : (
                          <span className="text-[12px] text-fuchsia-200">
                            {slot.variants.length} Versions
                          </span>
                        )}
                        <button
                          type="button"
                          className="rounded-md px-1 text-[18px] leading-none text-white/80 hover:text-white"
                          aria-label="Track actions"
                          title="Track actions"
                          onClick={() => {
                            setActionSlotId(slot.id);
                            setChainPickerOpen(false);
                          }}
                        >
                          ⋮
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={entry.groupId} className="flex items-start gap-[10px]">
                  <div className="flex shrink-0 flex-col items-center gap-1 self-stretch">
                    <div className="w-5 text-right text-[14px] font-medium text-white/50">
                      {entry.startIdx + 1}
                    </div>
                    <div className="flex flex-1 flex-col items-center gap-[5px]">
                      {Array.from({ length: 9 }).map((_, dotIdx) => (
                        <span
                          key={dotIdx}
                          className="h-[2px] w-[2px] rounded-full bg-[#5a22c9]"
                        />
                      ))}
                      <span className="text-[14px] text-[#5a22c9]">⛓</span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="space-y-2">
                      {entry.items.map(({ slot, track, idx }) => (
                        <div key={slot.id}>
                          <div className="flex items-start justify-between gap-3 py-0.5">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => playFromIndex(idx)}
                              title="Play from here"
                            >
                              <div className="truncate text-[16px] leading-[1.1]">
                                {toDisplayTrackTitle(slot.variants[0]?.track.title || "")}
                              </div>
                              <div className="mt-1 truncate text-[12px] leading-none text-white/70">
                                {getTrackShowLabel(track.url, showTitleByIdentifier)}
                              </div>
                            </button>

                            <div className="flex shrink-0 items-center gap-2 pt-1">
                              {slot.variants.length === 1 && track.length ? (
                                <span className="text-[14px] font-light tracking-[0.04em] text-white">
                                  {track.length}
                                </span>
                              ) : (
                                <span className="text-[12px] text-fuchsia-200">
                                  {slot.variants.length} Versions
                                </span>
                              )}
                              <button
                                type="button"
                                className="rounded-md px-1 text-[18px] leading-none text-white/80 hover:text-white"
                                aria-label="Track actions"
                                title="Track actions"
                                onClick={() => {
                                  setActionSlotId(slot.id);
                                  setChainPickerOpen(false);
                                }}
                              >
                                ⋮
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center justify-between rounded-lg bg-[#201438] px-3 py-2 text-[12px] text-[#bfa7ff]">
                      <span>These tracks are linked and will play in order</span>
                      <span className="text-[14px] leading-none">×</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {actionSlotId && activeActionItem && (
        <>
          <button
            type="button"
            aria-label="Close actions"
            className="fixed inset-0 z-40 bg-black/65"
            onClick={() => {
              setActionSlotId(null);
              setChainPickerOpen(false);
              setChainDraftIds([]);
            }}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-2xl border border-white/15 bg-[#16052c] p-4 shadow-2xl">
            {!chainPickerOpen ? (
              <div>
                <div className="mb-1 text-center text-xs uppercase tracking-[0.18em] text-white/55">
                  Track actions
                </div>
                <div className="mb-3 text-center text-sm text-white/80">
                  {toDisplayTrackTitle(activeActionItem.track.title)}
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white/95"
                    onClick={() => {
                      if (activeActionIdx >= 0) playFromIndex(activeActionIdx);
                      setActionSlotId(null);
                      setChainPickerOpen(false);
                    }}
                  >
                    Play from here
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/10 px-3 py-2.5 text-sm text-fuchsia-100"
                    onClick={() => {
                      const groupId = activeActionItem.slot.linkGroupId;
                      const selected = groupId
                        ? playableSlots
                            .filter((x) => x.slot.linkGroupId === groupId)
                            .map((x) => x.slot.id)
                        : [activeActionItem.slot.id];
                      setChainDraftIds(selected);
                      setChainPickerOpen(true);
                    }}
                  >
                    Chains
                  </button>
                  {activeActionItem.slot.linkGroupId ? (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-fuchsia-400/50 bg-transparent px-3 py-2.5 text-sm text-fuchsia-100"
                      onClick={() => {
                        unlinkSlot(playlist.id, activeActionItem.slot.id);
                        setActionSlotId(null);
                        setChainPickerOpen(false);
                        setChainDraftIds([]);
                      }}
                    >
                      Unlink
                    </button>
                  ) : (
                    activeActionIdx >= 0 &&
                    activeActionIdx < playlist.slots.length - 1 && (
                      <button
                        type="button"
                        className="w-full rounded-xl border border-fuchsia-400/50 bg-transparent px-3 py-2.5 text-sm text-fuchsia-100"
                        onClick={() => {
                          linkWithNext(playlist.id, activeActionItem.slot.id);
                          setActionSlotId(null);
                          setChainPickerOpen(false);
                        }}
                      >
                        Link next
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="w-full rounded-xl border border-white/20 bg-transparent px-3 py-2.5 text-sm text-white/85"
                    onClick={() => {
                      removeTrack(playlist.id, activeActionItem.slot.id);
                      setActionSlotId(null);
                      setChainPickerOpen(false);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-1 text-center text-xs uppercase tracking-[0.18em] text-white/55">
                  Chain songs
                </div>
                <div className="mb-3 text-center text-sm text-white/80">
                  Select songs to always play in order
                </div>
                <div className="max-h-[52vh] space-y-1 overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  {playableSlots.map((item, idx) => {
                    const showId = getArchiveIdentifier(item.track.url);
                    const inScope =
                      !activeShowIdentifier || showId === activeShowIdentifier;
                    const checked = chainDraftIds.includes(item.slot.id);
                    return (
                      <button
                        key={item.slot.id}
                        type="button"
                        disabled={!inScope}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                          checked
                            ? "border-fuchsia-400/70 bg-fuchsia-500/15"
                            : "border-white/10 bg-white/5"
                        } ${inScope ? "text-white/90" : "text-white/35 opacity-60"}`}
                        onClick={() => {
                          if (!inScope) return;
                          setChainDraftIds((prev) =>
                            prev.includes(item.slot.id)
                              ? prev.filter((x) => x !== item.slot.id)
                              : prev.concat(item.slot.id),
                          );
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-[14px]">
                            {idx + 1}. {toDisplayTrackTitle(item.track.title)}
                          </span>
                          <span className="shrink-0 text-xs text-white/70">
                            {checked ? "✓" : ""}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-white/60">
                          {getTrackShowLabel(item.track.url, showTitleByIdentifier)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white/85"
                    onClick={() => {
                      setChainPickerOpen(false);
                      setChainDraftIds([]);
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={chainDraftIds.length < 2}
                    className="flex-1 rounded-xl border border-fuchsia-400/60 bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100 disabled:opacity-40"
                    onClick={() => {
                      setChain(playlist.id, chainDraftIds);
                      setActionSlotId(null);
                      setChainPickerOpen(false);
                      setChainDraftIds([]);
                    }}
                  >
                    Save chain
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
