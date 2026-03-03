"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookmark,
  faChain,
  faChevronLeft,
  faEllipsisVertical,
  faGripLines,
  faMapPin,
  faPaperPlane,
  faMagnifyingGlass,
  faCirclePlay,
  faPlay,
  faShuffle,
  faTrash,
  faXmarkCircle,
} from "@fortawesome/pro-solid-svg-icons";

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

function venueFromTitle(title?: string): string {
  const t = String(title || "");
  const m = t.match(
    /live\s+(?:at|in)\s+(.+?)(?:\s+on\s+(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\(|$)/i,
  );
  return m?.[1]?.trim() || "";
}

function looksLikeArchiveIdentifier(value: string, identifier: string): boolean {
  const text = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = String(identifier || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!text) return true;
  if (id && (text.includes(id) || id.includes(text))) return true;
  return /^kglw(?:19|20)\d{2}/.test(text);
}

function buildShowLabel(
  rawTitle: string,
  identifier: string,
  rawVenue?: string,
  rawDate?: string,
): string {
  const isoDate =
    tryNormalizeShowDate(rawDate || "") ||
    tryNormalizeShowDate(rawTitle) ||
    tryNormalizeShowDate(identifier);
  const dateLabel = toUsDateLabel(isoDate);
  const venue = toDisplayTitle(rawVenue || venueFromTitle(rawTitle) || "").trim();
  if (venue && dateLabel) return `Live at ${venue} ${dateLabel}`;
  if (venue) return `Live at ${venue}`;

  const baseTitle = toDisplayTitle(rawTitle || "").trim();
  const useTitle = baseTitle && !looksLikeArchiveIdentifier(baseTitle, identifier);

  if (useTitle && dateLabel) return `${baseTitle} - ${dateLabel}`;
  if (useTitle) return baseTitle;
  if (dateLabel) return `Live show ${dateLabel}`;
  return identifier || "Unknown show";
}

function getTrackShowLabel(
  url: string | undefined,
  showTitleByIdentifier: Record<string, string>,
): string {
  const id = getArchiveIdentifier(url);
  if (!id) return "Unknown show";
  const candidate = showTitleByIdentifier[id] || buildShowLabel("", id);
  const looksLikeFileName = /\.(?:wav|flac|mp3|m4a|ogg)(?:\?.*)?$/i.test(candidate);
  if (!looksLikeFileName && !looksLikeArchiveIdentifier(candidate, id)) return candidate;

  const isoDate = tryNormalizeShowDate(id);
  const dateLabel = toUsDateLabel(isoDate);
  if (dateLabel) return `Live show ${dateLabel}`;
  return "Unknown show";
}

function splitShowLabelAndIsoDate(showLabel: string): { venueLabel: string; isoDate: string } {
  const raw = String(showLabel || "").trim();
  if (!raw) return { venueLabel: "", isoDate: "" };

  const mmddyyyy = raw.match(/(.*)\b(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-((?:19|20)\d{2})\b$/);
  if (mmddyyyy) {
    return {
      venueLabel: mmddyyyy[1].trim(),
      isoDate: `${mmddyyyy[4]}-${mmddyyyy[2]}-${mmddyyyy[3]}`,
    };
  }

  const yyyymmdd = raw.match(/(.*)\b((?:19|20)\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b$/);
  if (yyyymmdd) {
    return {
      venueLabel: yyyymmdd[1].trim(),
      isoDate: `${yyyymmdd[2]}-${yyyymmdd[3]}-${yyyymmdd[4]}`,
    };
  }

  return { venueLabel: raw, isoDate: "" };
}

type PlayableSlot = { slot: PlaylistSlot; track: Track };
type LinkedTrackItem = PlayableSlot & { idx: number };
type PlaylistRenderItem =
  | { type: "single"; item: LinkedTrackItem }
  | { type: "linked-group"; startIdx: number; groupId: string; items: LinkedTrackItem[] };
type ForcedVariantBySlotId = Record<string, string>;
const CHAIN_HINT_DISMISSED_KEY = "kglw.playlists.chainHintDismissed.v1";

function shuffleArray<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildPlaybackIndexOrder(playableSlots: PlayableSlot[], shuffleEnabled: boolean): number[] {
  const blocks = buildPlaybackBlocks(playableSlots);
  const orderedBlocks = shuffleEnabled ? shuffleArray(blocks) : blocks;
  return orderedBlocks.flat();
}

function buildPlaybackBlocks(playableSlots: PlayableSlot[]): number[][] {
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

    const group = (groups.get(groupId) || []).slice().sort((a, b) => {
      const ao = playableSlots[a]?.slot?.chainOrder;
      const bo = playableSlots[b]?.slot?.chainOrder;
      if (typeof ao === "number" && typeof bo === "number") return ao - bo;
      if (typeof ao === "number") return -1;
      if (typeof bo === "number") return 1;
      return a - b;
    });
    if (group.length < 2) {
      blocks.push([i]);
      consumed.add(i);
      continue;
    }

    blocks.push(group);
    group.forEach((idx) => consumed.add(idx));
  }

  return blocks;
}

function getRandomShuffleStartIndex(playableSlots: PlayableSlot[]): number {
  const blocks = buildPlaybackBlocks(playableSlots);
  if (blocks.length === 0) return 0;
  const block = blocks[Math.floor(Math.random() * blocks.length)] || [];
  return block[0] ?? 0;
}

function byDateAdded(a: PlaylistSlot, b: PlaylistSlot): number {
  const aa = Number.isFinite(a.addedAt) ? a.addedAt : 0;
  const bb = Number.isFinite(b.addedAt) ? b.addedAt : 0;
  if (aa !== bb) return aa - bb;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.id.localeCompare(b.id);
}

function orderSlotsForDisplay(slots: PlaylistSlot[]): PlaylistSlot[] {
  type ChainGroupDef = {
    groupId: string;
    ordered: PlaylistSlot[];
    anchorInBase: number;
  };
  const base = [...slots].sort(byDateAdded);
  const groups = new Map<string, PlaylistSlot[]>();
  for (const slot of base) {
    const gid = slot.linkGroupId;
    if (!gid) continue;
    const list = groups.get(gid) || [];
    list.push(slot);
    groups.set(gid, list);
  }

  const groupDefs = Array.from(groups.entries())
    .map(([groupId, list]) => {
      if (list.length < 2) return null;
      const ordered = [...list].sort((a, b) => {
        const ao = typeof a.chainOrder === "number" ? a.chainOrder : Number.POSITIVE_INFINITY;
        const bo = typeof b.chainOrder === "number" ? b.chainOrder : Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return byDateAdded(a, b);
      });
      const seed = ordered[0];
      const anchorInBase = base.findIndex((s) => s.id === seed.id);
      return { groupId, ordered, anchorInBase };
    })
    .filter((value): value is ChainGroupDef => value !== null)
    .sort((a, b) => a.anchorInBase - b.anchorInBase);

  let working = [...base];
  for (const def of groupDefs) {
    const groupIds = new Set(def.ordered.map((s) => s.id));
    const seedId = def.ordered[0]?.id;
    const currentAnchor = seedId
      ? working.findIndex((s) => s.id === seedId)
      : def.anchorInBase;
    const withoutGroup = working.filter((s) => !groupIds.has(s.id));
    const insertAt =
      currentAnchor < 0 ? withoutGroup.length : Math.min(currentAnchor, withoutGroup.length);
    working = [
      ...withoutGroup.slice(0, insertAt),
      ...def.ordered,
      ...withoutGroup.slice(insertAt),
    ];
  }

  return working;
}

function resolveSlotTrack(slot: PlaylistSlot, forcedVariantId?: string): Track | null {
  const variants = Array.isArray(slot.variants)
    ? slot.variants.filter((v) => Boolean(v?.track?.url))
    : [];
  if (variants.length === 0) return null;

  if (forcedVariantId) {
    const forced = variants.find((v) => v.id === forcedVariantId);
    if (forced?.track?.url) return forced.track;
  }

  const randomIndex = Math.floor(Math.random() * variants.length);
  return variants[randomIndex]?.track || null;
}

export default function PlaylistDetailPage() {
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const playlistId = Array.isArray(params?.id)
    ? params.id[0] || ""
    : params?.id || "";

  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), []);

  const setQueue = usePlayer((s) => s.setQueue);
  const playerQueue = usePlayer((s) => s.queue);
  const playerIndex = usePlayer((s) => s.index);
  const playerPlaying = usePlayer((s) => s.playing);

  const playlist = usePlaylists((s) =>
    s.playlists.find((p) => p.id === playlistId),
  );
  const removeTrack = usePlaylists((s) => s.removeTrack);
  const deletePlaylist = usePlaylists((s) => s.deletePlaylist);
  const setChain = usePlaylists((s) => s.setChain);
  const snapChain = usePlaylists((s) => s.snapChain);
  const [actionSlotId, setActionSlotId] = useState<string | null>(null);
  const [chainPickerOpen, setChainPickerOpen] = useState(false);
  const [chainSeedSlotId, setChainSeedSlotId] = useState<string | null>(null);
  const [chainEditGroupId, setChainEditGroupId] = useState<string | null>(null);
  const [chainDraftIds, setChainDraftIds] = useState<string[]>([]);
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({});
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [chainHintDismissed, setChainHintDismissed] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      return localStorage.getItem(CHAIN_HINT_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [showTitleByIdentifier, setShowTitleByIdentifier] = useState<
    Record<string, string>
  >({});

  const orderedSlots = useMemo(
    () => orderSlotsForDisplay(playlist?.slots || []),
    [playlist],
  );

  const playableSlots = useMemo(() => {
    if (!playlist) return [] as PlayableSlot[];

    const out: PlayableSlot[] = [];

    for (const slot of orderedSlots) {
      const variants = Array.isArray(slot.variants) ? slot.variants : [];
      if (variants.length === 0) continue;
      const chosen = variants[0];
      if (!chosen?.track?.url) continue;
      out.push({ slot, track: chosen.track });
    }
    return out;
  }, [orderedSlots, playlist]);

  const chainGroups = useMemo(() => {
    if (!playlist) return 0;
    return new Set(
      playlist.slots.map((s) => s.linkGroupId).filter(Boolean),
    ).size;
  }, [playlist]);
  const versionsCount = useMemo(
    () => (playlist?.slots || []).reduce((sum, s) => sum + s.variants.length, 0),
    [playlist],
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
  const firstChainedRenderIndex = useMemo(
    () => renderItems.findIndex((entry) => entry.type === "linked-group"),
    [renderItems],
  );
  const activeActionItem = useMemo(
    () => playableSlots.find((x) => x.slot.id === actionSlotId) || null,
    [actionSlotId, playableSlots],
  );
  const activeActionIdx = useMemo(
    () => playableSlots.findIndex((x) => x.slot.id === actionSlotId),
    [actionSlotId, playableSlots],
  );
  function playFromIndex(
    startIdx: number,
    forcedBySlotId: ForcedVariantBySlotId = {},
    useShuffle = false,
  ) {
    if (startIdx < 0 || playableSlots.length === 0) return;
    const playbackOrder = buildPlaybackIndexOrder(playableSlots, useShuffle);
    if (playbackOrder.length === 0) return;
    const resolvedByIdx = playableSlots.map((item) =>
      resolveSlotTrack(item.slot, forcedBySlotId[item.slot.id]),
    );
    const playbackQueue = playbackOrder
      .map((idx) => resolvedByIdx[idx])
      .filter(Boolean) as Track[];
    if (playbackQueue.length === 0) return;

    const startInQueue = playbackOrder.indexOf(startIdx);
    const safeStart = startInQueue >= 0 ? startInQueue : 0;
    setQueue(playbackQueue, safeStart);
  }

  const activeTrackUrl = playerPlaying ? playerQueue[playerIndex]?.url || "" : "";

  function closeChainEditor() {
    setChainPickerOpen(false);
    setChainSeedSlotId(null);
    setChainEditGroupId(null);
    setChainDraftIds([]);
    setDraggedSlotId(null);
  }

  function toggleChainDraftSlot(slotId: string) {
    setChainDraftIds((prev) => {
      const seedId = chainSeedSlotId;
      if (seedId && slotId === seedId) return prev;
      const next = prev.includes(slotId)
        ? prev.filter((x) => x !== slotId)
        : prev.concat(slotId);
      if (!seedId) return next;
      const withoutSeed = next.filter((x) => x !== seedId);
      return [seedId, ...withoutSeed];
    });
  }

  function reorderDraftByDrop(targetSlotId: string) {
    if (!draggedSlotId) return;
    setChainDraftIds((prev) => {
      const seedId = chainSeedSlotId;
      const sourceId = draggedSlotId;
      if (sourceId === targetSlotId) return prev;
      if (seedId && sourceId === seedId) return prev;
      if (!prev.includes(targetSlotId)) return prev;

      const withoutSource = prev.filter((id) => id !== sourceId);
      const targetIndex = withoutSource.indexOf(targetSlotId);
      if (targetIndex < 0) return prev;
      withoutSource.splice(targetIndex, 0, sourceId);

      if (!seedId) return withoutSource;
      const noSeed = withoutSource.filter((id) => id !== seedId);
      return [seedId, ...noSeed];
    });
    setDraggedSlotId(null);
  }

  useEffect(() => {
    if (!actionSlotId) return;
    const exists = playableSlots.some((x) => x.slot.id === actionSlotId);
    if (exists) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActionSlotId(null);
    closeChainEditor();
  }, [actionSlotId, playableSlots]);
  useEffect(() => {
    if (!actionSlotId && !chainPickerOpen) return;
    setPlaylistMenuOpen(false);
  }, [actionSlotId, chainPickerOpen]);
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
            const data = (await res.json()) as {
              metadata?: { title?: string; venue?: string; date?: string };
            };
            const rawTitle = data?.metadata?.title || "";
            const rawVenue = data?.metadata?.venue || "";
            const rawDate = data?.metadata?.date || "";
            updates[id] = buildShowLabel(rawTitle, id, rawVenue, rawDate);
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
      <div className="relative isolate overflow-hidden">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt=""
            className="absolute left-0 top-0 h-[280px] w-full object-cover opacity-10"
          />
        ) : null}
        <div className="absolute inset-x-0 top-0 h-[280px] bg-linear-to-b from-[#1a0838]/65 via-[#110028]/90 to-[#080017]" />

        <div className="relative mx-auto w-full max-w-[393px] px-6 pb-6 pt-12">
          <div className="flex items-center">
            <Link href="/" className="text-white/85 hover:text-white" aria-label="Back">
              <FontAwesomeIcon icon={faChevronLeft} className="text-[17px]" />
            </Link>
          </div>

          <section className="mt-9 isolate">
            <div className="rounded-[16px] border border-white/20 bg-white/5 p-4 backdrop-blur-[6px]">
              <div className="flex items-start justify-between gap-3">
                <h1 className="truncate text-[20px] leading-[1.05] font-medium [font-family:var(--font-roboto-condensed)]">
                  {playlist.name}
                </h1>
                <div className="relative flex items-center gap-2">
                  <FontAwesomeIcon icon={faBookmark} className="mt-1 text-[20px] text-white/90" />
                  <button
                    type="button"
                    aria-label="Playlist options"
                    className="rounded-md px-1 text-[18px] leading-none text-white/65 hover:text-white"
                    onClick={() => setPlaylistMenuOpen((v) => !v)}
                  >
                    <FontAwesomeIcon icon={faEllipsisVertical} />
                  </button>
                  {playlistMenuOpen && (
                    <div className="absolute right-0 top-7 z-30 w-44 rounded-[12px] border border-white/15 bg-[#16052c] p-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-white/90 hover:bg-white/10 [font-family:var(--font-roboto-condensed)]"
                        onClick={async () => {
                          const shareUrl =
                            typeof window !== "undefined" ? window.location.href : "";
                          const shareTitle = `Playlist: ${playlist.name}`;
                          const shareText = `Check out my playlist "${playlist.name}"`;
                          try {
                            if (
                              typeof navigator !== "undefined" &&
                              typeof navigator.share === "function"
                            ) {
                              await navigator.share({
                                title: shareTitle,
                                text: shareText,
                                url: shareUrl,
                              });
                            } else if (
                              typeof navigator !== "undefined" &&
                              navigator.clipboard?.writeText
                            ) {
                              await navigator.clipboard.writeText(shareUrl);
                            }
                          } catch {
                            // ignore user-cancelled share sheets and clipboard failures
                          }
                          setPlaylistMenuOpen(false);
                        }}
                      >
                        <FontAwesomeIcon icon={faPaperPlane} className="text-[12px]" />
                        <span>Share playlist</span>
                      </button>
                      <button
                        type="button"
                        className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] text-rose-200 hover:bg-rose-500/20 [font-family:var(--font-roboto-condensed)]"
                        onClick={() => {
                          if (!confirm(`Delete playlist "${playlist.name}"?`)) return;
                          deletePlaylist(playlist.id);
                          setPlaylistMenuOpen(false);
                          router.push("/playlists");
                        }}
                      >
                        <FontAwesomeIcon icon={faTrash} className="text-[12px]" />
                        <span>Delete playlist</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[16px] font-light text-white/80 [font-family:var(--font-roboto-condensed)]">
                <span>
                  {playlist.slots.length} Track{playlist.slots.length === 1 ? "" : "s"}
                </span>
                <span className="text-white/45">•</span>
                <span>
                  {versionsCount} Version{versionsCount === 1 ? "" : "s"}
                </span>
                <span className="text-white/45">•</span>
                <span>
                  {chainGroups} Chain{chainGroups === 1 ? "" : "s"}
                </span>
                <span className="text-white/45">•</span>
                <span>{totalDurationLabel}</span>
              </div>
            </div>
            <div className="-mt-[1px] rounded-bl-[16px] rounded-br-[16px] border border-white/20 px-4 pb-3 pt-7 backdrop-blur-[6px]">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-[24px] bg-[#5a22c9] px-4 py-2.5 text-[14px] text-white [font-family:var(--font-roboto)]"
                  onClick={() => playFromIndex(0)}
                  disabled={playableSlots.length === 0}
                >
                  Play
                  <FontAwesomeIcon icon={faCirclePlay} className="text-[16px]" />
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-[24px] bg-linear-to-r from-[#5a22c9] to-[#c86c45] px-4 py-2.5 text-[14px] text-white [font-family:var(--font-roboto)]"
                  onClick={() => playFromIndex(getRandomShuffleStartIndex(playableSlots), {}, true)}
                  disabled={playableSlots.length === 0}
                >
                  Shuffle
                  <FontAwesomeIcon icon={faShuffle} className="text-[13px]" />
                </button>
              </div>
            </div>
          </section>

          <div className="mt-4 flex items-center justify-between rounded-[16px] bg-white/5 px-4 py-3.5 backdrop-blur-[6px]">
            <span className="text-[14px] leading-none text-white/65 [font-family:var(--font-roboto-condensed)]">
              Search this playlist
            </span>
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-[18px] text-white/90" />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[393px] px-6 pb-8">
        {chainPickerOpen ? (
          <section className="mt-4 space-y-3 [font-family:var(--font-roboto-condensed)]">
            {playableSlots.map((item, idx) => {
              const slotId = item.slot.id;
              const inChain = chainDraftIds.includes(slotId);
              const prevInChain =
                idx > 0 && chainDraftIds.includes(playableSlots[idx - 1].slot.id);
              const nextInChain =
                idx < playableSlots.length - 1 &&
                chainDraftIds.includes(playableSlots[idx + 1].slot.id);
              const canDrag = !chainSeedSlotId || slotId !== chainSeedSlotId;
              const title = toDisplayTrackTitle(item.slot.variants[0]?.track.title || item.track.title);

              return (
                <div key={slotId} className="flex items-stretch gap-[10px]">
                  <button
                    type="button"
                    className="flex w-[7px] shrink-0 flex-col items-center"
                    onClick={() => toggleChainDraftSlot(slotId)}
                    onDragOver={(e) => {
                      if (!inChain) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!inChain) return;
                      e.preventDefault();
                      reorderDraftByDrop(slotId);
                    }}
                    title={inChain ? "In chain" : "Add to chain"}
                  >
                    {inChain ? (
                      <>
                        <span
                          className={`w-[2px] flex-1 rounded-full bg-[#5a22c9] ${
                            prevInChain ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <FontAwesomeIcon icon={faChain} className="text-[11px] text-[#5a22c9]" />
                        <span
                          className={`w-[2px] flex-1 rounded-full bg-[#5a22c9] ${
                            nextInChain ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      </>
                    ) : (
                      <FontAwesomeIcon icon={faChain} className="mt-3 text-[11px] text-white/45" />
                    )}
                  </button>

                  <div
                    className={`flex w-full items-center justify-between rounded-[12px] border px-3 py-2 transition ${
                      inChain
                        ? "border-[#5a22c9] bg-[rgba(48,26,89,0.2)]"
                        : "border-white/20 bg-transparent opacity-75 hover:opacity-100"
                    }`}
                    onDragOver={(e) => {
                      if (!inChain) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!inChain) return;
                      e.preventDefault();
                      reorderDraftByDrop(slotId);
                    }}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => toggleChainDraftSlot(slotId)}
                    >
                      <div className="truncate text-[16px] leading-none text-white">
                        {title}
                      </div>
                      <div className="mt-1 truncate text-[12px] leading-none text-white/70">
                        {getTrackShowLabel(item.track.url, showTitleByIdentifier)}
                      </div>
                    </button>
                    <div className="ml-3 flex shrink-0 items-center gap-3">
                      {item.slot.variants.length > 1 ? (
                        <span className="text-[12px] text-fuchsia-200">
                          {item.slot.variants.length} Versions
                        </span>
                      ) : (
                        <span className="text-[14px] text-white">{item.track.length || ""}</span>
                      )}
                      <button
                        type="button"
                        draggable={canDrag}
                        onDragStart={() => {
                          if (!canDrag) return;
                          setDraggedSlotId(slotId);
                        }}
                        onDragEnd={() => setDraggedSlotId(null)}
                        className={`text-[13px] ${canDrag ? "text-white/65 cursor-grab active:cursor-grabbing" : "text-white/30 cursor-not-allowed"}`}
                        title={canDrag ? "Drag to add/reorder in chain" : "First chained song is fixed"}
                      >
                        <FontAwesomeIcon icon={faGripLines} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ) : playableSlots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm text-white/70">
            Empty playlist. Add tracks from any show.
          </div>
        ) : (
          <section className="space-y-5 [font-family:var(--font-roboto-condensed)]">
            {renderItems.map((entry, entryIdx) => {
              if (entry.type === "single") {
                const { slot, track, idx } = entry.item;
                const activeVariantId =
                  slot.variants.find((v) => v.track.url === activeTrackUrl)?.id || "";
                const isSlotActive = Boolean(activeVariantId);
                return (
                  <div key={slot.id} className="py-[1px]">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => playFromIndex(idx)}
                        title="Play from here"
                      >
                        <div
                          className={`truncate text-[16px] leading-[1.03] ${
                            isSlotActive ? "text-[#EFD50F]" : "text-white"
                          }`}
                        >
                          {toDisplayTrackTitle(slot.variants[0]?.track.title || "")}
                        </div>
                        <div className="mt-1 truncate text-[12px] leading-[1.05] text-white/70">
                          {getTrackShowLabel(track.url, showTitleByIdentifier)}
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-2.5 pt-1">
                        {slot.variants.length === 1 && track.length ? (
                          <span className="text-[14px] leading-none font-light tracking-[0.04em] text-white">
                            {track.length}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="flex items-center gap-1.5 rounded-[6px] bg-linear-to-r from-fuchsia-500/35 to-orange-400/30 px-2 py-[3px] text-[12px] leading-none text-white hover:from-fuchsia-500/45 hover:to-orange-400/45"
                            onClick={() =>
                              setExpandedVariants((prev) => ({
                                ...prev,
                                [slot.id]: !prev[slot.id],
                              }))
                            }
                          >
                            <FontAwesomeIcon icon={faShuffle} className="text-[10px] text-white/95" />
                            {slot.variants.length} Versions
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-md px-1 text-[18px] leading-none text-white/55 hover:text-white/90"
                          aria-label="Track actions"
                          title="Track actions"
                          onClick={() => {
                            setActionSlotId(slot.id);
                            setChainPickerOpen(false);
                          }}
                        >
                          <FontAwesomeIcon icon={faEllipsisVertical} />
                        </button>
                      </div>
                    </div>
                    {slot.variants.length > 1 && expandedVariants[slot.id] && (
                      <div className="ml-6 mt-2 space-y-2">
                        {slot.variants.map((v, vi) => (
                          <button
                            key={v.id}
                            type="button"
                            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[14px] text-white/75 hover:bg-white/5"
                            onClick={() => playFromIndex(idx, { [slot.id]: v.id })}
                          >
                            <span
                              className={`min-w-0 truncate ${
                                v.id === activeVariantId ? "text-[#EFD50F]" : "text-white/75"
                              }`}
                            >
                              {vi + 1}. {getTrackShowLabel(v.track.url, showTitleByIdentifier)}
                            </span>
                            <span className="shrink-0 text-[14px] text-white">{v.track.length || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={entry.groupId} className="flex items-start gap-[10px]">
                  <div className="flex shrink-0 flex-col items-center self-stretch pt-[5px]">
                    <span className="mb-[5px] size-[6px] rounded-full bg-[#5a22c9]" />
                    <div className="flex flex-1 flex-col items-center gap-[4px]">
                      {Array.from({ length: 11 }).map((_, dotIdx) => (
                        <span
                          key={dotIdx}
                          className="h-[2px] w-[2px] rounded-full bg-[#5a22c9]"
                        />
                      ))}
                      <FontAwesomeIcon icon={faChain} className="text-[11px] text-[#5a22c9]" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="space-y-2">
                      {entry.items.map(({ slot, track, idx }) => {
                        const activeVariantId =
                          slot.variants.find((v) => v.track.url === activeTrackUrl)?.id || "";
                        const isSlotActive = Boolean(activeVariantId);
                        return (
                          <div key={slot.id}>
                            <div className="flex items-start justify-between gap-3 py-0.5">
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => playFromIndex(idx)}
                                title="Play from here"
                              >
                                <div
                                  className={`truncate text-[16px] leading-[1.03] [font-family:var(--font-roboto-condensed)] ${
                                    isSlotActive ? "text-[#EFD50F]" : "text-white"
                                  }`}
                                >
                                  {toDisplayTrackTitle(slot.variants[0]?.track.title || "")}
                                </div>
                                <div className="mt-1 truncate text-[12px] leading-[1.05] text-white/70">
                                  {getTrackShowLabel(track.url, showTitleByIdentifier)}
                                </div>
                              </button>

                              <div className="flex shrink-0 items-center gap-2 pt-1">
                                {slot.variants.length === 1 && track.length ? (
                                  <span className="text-[14px] leading-none font-light tracking-[0.04em] text-white">
                                    {track.length}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="flex items-center gap-1.5 rounded-[6px] bg-linear-to-r from-fuchsia-500/35 to-orange-400/30 px-2 py-[3px] text-[12px] leading-none text-white hover:from-fuchsia-500/45 hover:to-orange-400/45"
                                    onClick={() =>
                                      setExpandedVariants((prev) => ({
                                        ...prev,
                                        [slot.id]: !prev[slot.id],
                                      }))
                                    }
                                  >
                                    <FontAwesomeIcon icon={faShuffle} className="text-[10px] text-white/95" />
                                    {slot.variants.length} Versions
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="rounded-md px-1 text-[18px] leading-none text-white/55 hover:text-white/90"
                                  aria-label="Track actions"
                                  title="Track actions"
                                  onClick={() => {
                                    setActionSlotId(slot.id);
                                    setChainPickerOpen(false);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faEllipsisVertical} />
                                </button>
                              </div>
                            </div>
                            {slot.variants.length > 1 && expandedVariants[slot.id] && (
                              <div className="mt-2 space-y-2 pl-2">
                                {slot.variants.map((v, vi) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[14px] text-white/75 hover:bg-white/5"
                                    onClick={() => playFromIndex(idx, { [slot.id]: v.id })}
                                  >
                                    <span
                                      className={`min-w-0 truncate ${
                                        v.id === activeVariantId ? "text-[#EFD50F]" : "text-white/75"
                                      }`}
                                    >
                                      {vi + 1}. {getTrackShowLabel(v.track.url, showTitleByIdentifier)}
                                    </span>
                                    <span className="shrink-0 text-[14px] text-white">{v.track.length || ""}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {!chainHintDismissed && entryIdx === firstChainedRenderIndex && (
                      <div className="mt-2 flex items-center justify-between rounded-[8px] bg-[#201438] px-3 py-2 text-[12px] text-[#8f77cf]">
                        <span>These tracks are chained and will play in order</span>
                        <button
                          type="button"
                          className="text-[14px] leading-none text-[#7c65be] hover:text-[#b8a7e6]"
                          aria-label="Dismiss chain message"
                          onClick={() => {
                            setChainHintDismissed(true);
                            try {
                              localStorage.setItem(CHAIN_HINT_DISMISSED_KEY, "1");
                            } catch {
                              // ignore storage write errors
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faXmarkCircle} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {chainPickerOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[393px] bg-[#080017] px-6 pb-10 pt-6 shadow-[0_-4px_4px_rgba(0,0,0,0.25)]">
          {chainEditGroupId && (
            <button
              type="button"
              className="mb-3 w-full rounded-[12px] border border-[#5a22c9]/70 bg-[rgba(48,26,89,0.15)] px-4 py-3 text-[18px] leading-none [font-family:var(--font-roboto-condensed)] text-[#c8b5ff] hover:bg-[rgba(72,36,124,0.25)]"
              onClick={() => {
                snapChain(playlist.id, chainEditGroupId);
                closeChainEditor();
              }}
            >
              Snap Chain
            </button>
          )}
          <button
            type="button"
            disabled={chainDraftIds.length < 2}
            className="w-full rounded-[12px] bg-[rgba(48,26,89,0.25)] px-4 py-4 text-[28px] leading-none [font-family:var(--font-roboto-condensed)] text-white disabled:opacity-40"
            onClick={() => {
              setChain(playlist.id, chainDraftIds);
              setActionSlotId(null);
              closeChainEditor();
            }}
          >
            Save Chains
          </button>
          <button
            type="button"
            className="mt-5 w-full text-center text-[14px] [font-family:var(--font-roboto-condensed)] text-white/90 hover:text-white transition"
            onClick={() => closeChainEditor()}
          >
            Cancel
          </button>
        </div>
      )}

      {actionSlotId && activeActionItem && (
        <>
          <button
            type="button"
            aria-label="Close actions"
            className="fixed inset-0 z-40 bg-black/65"
            onClick={() => {
              setActionSlotId(null);
              closeChainEditor();
            }}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[393px] rounded-t-[16px] bg-[#080017] px-6 pb-10 pt-6 shadow-[0_-4px_4px_rgba(0,0,0,0.25)]">
            <div>
              {(() => {
                const showLabel = getTrackShowLabel(
                  activeActionItem.track.url,
                  showTitleByIdentifier,
                );
                const { venueLabel, isoDate } = splitShowLabelAndIsoDate(showLabel);
                return (
                  <div className="mb-6 space-y-2">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-[16px] leading-none [font-family:var(--font-roboto-condensed)]">
                        {toDisplayTrackTitle(activeActionItem.track.title)}
                      </div>
                      <div className="shrink-0 text-[14px] text-white/85 [font-family:var(--font-roboto-condensed)]">
                        {activeActionItem.track.length || "—"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[14px] text-white/40 [font-family:var(--font-roboto-condensed)]">
                      <div className="min-w-0 truncate flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faMapPin} className="text-[11px]" />
                        <span>{venueLabel}</span>
                      </div>
                      <div className="shrink-0">{isoDate}</div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-[12px] bg-[rgba(48,26,89,0.25)] px-2 py-4 text-[16px] [font-family:var(--font-roboto-condensed)] hover:bg-[rgba(72,36,124,0.35)] transition"
                    onClick={() => {
                      if (activeActionIdx >= 0) playFromIndex(activeActionIdx);
                      setActionSlotId(null);
                    }}
                  >
                    <FontAwesomeIcon icon={faPlay} className="text-[13px]" />
                    Play
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-[12px] bg-[rgba(48,26,89,0.25)] px-2 py-4 text-[16px] [font-family:var(--font-roboto-condensed)] hover:bg-[rgba(72,36,124,0.35)] transition"
                    onClick={async () => {
                      const shareUrl =
                        typeof window !== "undefined" ? window.location.href : "";
                      const shareTitle = `${playlist.name} - ${toDisplayTrackTitle(
                        activeActionItem.track.title,
                      )}`;
                      const shareText = `Check out this track in my playlist: ${toDisplayTrackTitle(
                        activeActionItem.track.title,
                      )}`;
                      try {
                        if (
                          typeof navigator !== "undefined" &&
                          typeof navigator.share === "function"
                        ) {
                          await navigator.share({
                            title: shareTitle,
                            text: shareText,
                            url: shareUrl,
                          });
                        } else if (
                          typeof navigator !== "undefined" &&
                          navigator.clipboard?.writeText
                        ) {
                          await navigator.clipboard.writeText(shareUrl);
                        }
                      } catch {
                        // Ignore user-cancelled share sheets and clipboard failures.
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} className="text-[13px]" />
                    Share
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-[12px] bg-[rgba(48,26,89,0.25)] px-2 py-4 text-[16px] [font-family:var(--font-roboto-condensed)] hover:bg-[rgba(72,36,124,0.35)] transition"
                    onClick={() => {
                      const groupId = activeActionItem.slot.linkGroupId;
                      const selected = groupId
                        ? playableSlots
                            .filter((x) => x.slot.linkGroupId === groupId)
                            .map((x) => x.slot.id)
                        : [activeActionItem.slot.id];
                      setChainSeedSlotId(selected[0] || activeActionItem.slot.id);
                      setChainEditGroupId(groupId || null);
                      setChainDraftIds(selected);
                      setActionSlotId(null);
                      setChainPickerOpen(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faChain} className="text-[13px]" />
                    {activeActionItem.slot.linkGroupId ? "Edit Chain" : "Chain"}
                  </button>
                </div>

                <button
                  type="button"
                  className="w-full rounded-[12px] bg-[rgba(48,26,89,0.25)] px-4 py-4 text-[16px] [font-family:var(--font-roboto-condensed)] hover:bg-[rgba(72,36,124,0.35)] transition flex items-center justify-center gap-2"
                  onClick={() => {
                    removeTrack(playlist.id, activeActionItem.slot.id);
                    setActionSlotId(null);
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} className="text-[13px]" />
                  Remove
                </button>
              </div>

              <button
                type="button"
                className="mt-6 w-full text-center text-[14px] [font-family:var(--font-roboto-condensed)] text-white/90 hover:text-white transition"
                onClick={() => {
                  setActionSlotId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
