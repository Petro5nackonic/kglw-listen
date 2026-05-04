// Lightweight typed wrapper around Google Analytics 4 (gtag).
//
// Why a wrapper:
// - Single place to enable/disable tracking, redact PII, batch transformations.
// - Strongly typed event helpers prevent drift in event names / params over
//   time, which keeps GA4 dashboards stable.
// - SSR-safe: every helper is a no-op when window/gtag is unavailable.
//
// All custom events are snake_case to match GA4 naming guidance.
// See app/layout.tsx for where the GA gtag.js script is mounted.

const CLIENT_ID_STORAGE_KEY = "kglw.analytics.clientId.v1";
const SESSION_ID_STORAGE_KEY = "kglw.analytics.sessionId.v1";
const SESSION_LAST_TS_KEY = "kglw.analytics.sessionLastTs.v1";
// Treat 30 minutes of inactivity as a new session, matching GA4's default.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function safeUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Ignore and fall through.
  }
  // RFC4122-ish fallback for older browsers / non-secure contexts.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode, quota); analytics should
    // never break the app.
  }
}

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let cid = readStorage(CLIENT_ID_STORAGE_KEY);
  if (!cid) {
    cid = safeUUID();
    writeStorage(CLIENT_ID_STORAGE_KEY, cid);
  }
  return cid;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const now = Date.now();
  const lastTsRaw = readStorage(SESSION_LAST_TS_KEY);
  const lastTs = Number(lastTsRaw);
  let sid = readStorage(SESSION_ID_STORAGE_KEY);
  const expired =
    !sid || !Number.isFinite(lastTs) || now - lastTs > SESSION_TIMEOUT_MS;
  if (expired) {
    sid = safeUUID();
    writeStorage(SESSION_ID_STORAGE_KEY, sid);
  }
  writeStorage(SESSION_LAST_TS_KEY, String(now));
  return sid;
}

type EventParams = Record<string, string | number | boolean | undefined>;

function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.gtag === "function";
}

// Strip empty / undefined params and clamp string lengths to GA4's limits
// (100 chars for param names, 500 chars for param values) to avoid silent drops.
function cleanParams(input?: EventParams): EventParams {
  const out: EventParams = {};
  if (!input) return out;
  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue === undefined || rawValue === null) continue;
    const cleanKey = key.slice(0, 40);
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) continue;
      out[cleanKey] = trimmed.slice(0, 100);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[cleanKey] = rawValue;
    } else if (typeof rawValue === "boolean") {
      out[cleanKey] = rawValue;
    }
  }
  return out;
}

export function trackEvent(eventName: string, params?: EventParams): void {
  if (!isAnalyticsEnabled()) return;
  try {
    const enriched = cleanParams({
      ...params,
      client_id: getClientId(),
      session_id: getSessionId(),
    });
    window.gtag?.("event", eventName, enriched);
  } catch {
    // Analytics must never throw into product code.
  }
}

// ---------- Player ----------

export type PlaybackContext = {
  songTitle?: string;
  showKey?: string;
  showDate?: string;
  venue?: string;
  trackUrl?: string;
  playlistId?: string;
  playlistName?: string;
  playlistSource?: string;
};

function playbackParams(ctx?: PlaybackContext): EventParams {
  if (!ctx) return {};
  return {
    song_title: ctx.songTitle,
    show_key: ctx.showKey,
    show_date: ctx.showDate,
    venue: ctx.venue,
    track_url: ctx.trackUrl,
    playlist_id: ctx.playlistId,
    playlist_name: ctx.playlistName,
    playlist_source: ctx.playlistSource,
  };
}

export function trackPlayTrack(ctx: PlaybackContext, source: string) {
  trackEvent("play_track", { ...playbackParams(ctx), source });
}

export function trackPauseTrack(ctx: PlaybackContext, position: number) {
  trackEvent("pause_track", {
    ...playbackParams(ctx),
    position_seconds: Math.max(0, Math.round(position)),
  });
}

export function trackTrackComplete(ctx: PlaybackContext, duration: number) {
  trackEvent("track_complete", {
    ...playbackParams(ctx),
    duration_seconds: Math.max(0, Math.round(duration)),
    percent_listened: 100,
  });
}

export function trackTrackSkip(
  ctx: PlaybackContext,
  position: number,
  duration: number,
  direction: "next" | "prev" | "stop" | "auto",
) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const percent = safeDuration > 0
    ? Math.max(0, Math.min(100, Math.round((position / safeDuration) * 100)))
    : 0;
  trackEvent("track_skip", {
    ...playbackParams(ctx),
    direction,
    position_seconds: Math.max(0, Math.round(position)),
    duration_seconds: Math.round(safeDuration),
    percent_listened: percent,
  });
}

export function trackSeek(ctx: PlaybackContext, fromSec: number, toSec: number) {
  trackEvent("seek_track", {
    ...playbackParams(ctx),
    from_seconds: Math.max(0, Math.round(fromSec)),
    to_seconds: Math.max(0, Math.round(toSec)),
    delta_seconds: Math.round(toSec - fromSec),
  });
}

export function trackNextVersion(ctx: PlaybackContext) {
  trackEvent("next_version", playbackParams(ctx));
}

export function trackLoveSong(ctx: PlaybackContext) {
  trackEvent("love_song", playbackParams(ctx));
}

export function trackShareSong(ctx: PlaybackContext, result: "copied" | "error") {
  trackEvent("share_song", { ...playbackParams(ctx), result });
}

export function trackOpenSongSheet(ctx: PlaybackContext) {
  trackEvent("open_song_sheet", playbackParams(ctx));
}

export function trackOpenQueueSheet(ctx: PlaybackContext, queueLength: number) {
  trackEvent("open_queue_sheet", {
    ...playbackParams(ctx),
    queue_length: queueLength,
  });
}

// ---------- Playlists ----------

export function trackPlaylistCreate(name: string, source: "user" | "prebuilt") {
  trackEvent("playlist_create", { playlist_name: name, playlist_source: source });
}

export function trackPlaylistDelete(name: string, source: string | undefined, slotCount: number) {
  trackEvent("playlist_delete", {
    playlist_name: name,
    playlist_source: source,
    slot_count: slotCount,
  });
}

export function trackPlaylistRename(playlistId: string, fromName: string, toName: string) {
  trackEvent("playlist_rename", {
    playlist_id: playlistId,
    playlist_from: fromName,
    playlist_to: toName,
  });
}

export function trackPlaylistDuplicate(fromName: string, toName: string) {
  trackEvent("playlist_duplicate", {
    playlist_from: fromName,
    playlist_to: toName,
  });
}

export function trackTrackAddToPlaylist(args: {
  playlistName: string;
  playlistSource?: string;
  songTitle: string;
  showKey?: string;
  result: "added" | "fused" | "exists";
}) {
  trackEvent("track_add_to_playlist", {
    playlist_name: args.playlistName,
    playlist_source: args.playlistSource,
    song_title: args.songTitle,
    show_key: args.showKey,
    result: args.result,
  });
}

export function trackTrackRemoveFromPlaylist(playlistName: string) {
  trackEvent("track_remove_from_playlist", { playlist_name: playlistName });
}

export function trackChainCreate(playlistName: string, chainLength: number) {
  trackEvent("chain_create", {
    playlist_name: playlistName,
    chain_length: chainLength,
  });
}

export function trackChainRemove(playlistName: string) {
  trackEvent("chain_remove", { playlist_name: playlistName });
}

export function trackSlotVariantsSet(playlistName: string, variantCount: number) {
  trackEvent("slot_variants_set", {
    playlist_name: playlistName,
    variant_count: variantCount,
  });
}

// ---------- Navigation ----------

export function trackNavClick(label: string, href: string) {
  trackEvent("nav_click", { label, href });
}

export function trackViewShow(showKey: string, showDate?: string) {
  trackEvent("view_show", { show_key: showKey, show_date: showDate });
}

export function trackViewSong(songTitle: string) {
  trackEvent("view_song", { song_title: songTitle });
}

export function trackSearch(query: string, scope: string) {
  trackEvent("search", { search_term: query, scope });
}
