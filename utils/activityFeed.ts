export type ActivityType = "played_show" | "played_playlist" | "played_song";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  createdAt: number;
  showKey?: string;
  showTitle?: string;
  songTitle?: string;
  playlistId?: string;
  playlistName?: string;
};

const ACTIVITY_FEED_KEY = "kglw.activityFeed.v1";
const MAX_ACTIVITY_ITEMS = 500;
const DEDUPE_WINDOW_MS = 30_000;

function safeRead(): ActivityItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVITY_FEED_KEY);
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object")
      .map((x) => x as ActivityItem)
      .filter((x) => typeof x.type === "string" && typeof x.createdAt === "number");
  } catch {
    return [];
  }
}

function safeWrite(items: ActivityItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVITY_FEED_KEY, JSON.stringify(items));
  } catch {
    // ignore storage failures
  }
}

function fingerprint(item: ActivityItem): string {
  return [
    item.type,
    item.showKey || "",
    item.songTitle || "",
    item.playlistId || "",
    item.playlistName || "",
  ].join("|");
}

export function readActivityFeed(): ActivityItem[] {
  return safeRead().slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function clearActivityFeed() {
  safeWrite([]);
}

export function logActivity(input: Omit<ActivityItem, "id" | "createdAt">) {
  if (typeof window === "undefined") return;
  const current = safeRead();
  const next: ActivityItem = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };

  const nextFp = fingerprint(next);
  const latestSame = current.find((item) => fingerprint(item) === nextFp);
  if (latestSame && Math.abs(next.createdAt - latestSame.createdAt) < DEDUPE_WINDOW_MS) {
    return;
  }

  const merged = [next, ...current].slice(0, MAX_ACTIVITY_ITEMS);
  safeWrite(merged);
}

export function logPlayedShow(show: { showKey?: string; showTitle?: string }) {
  logActivity({
    type: "played_show",
    showKey: show.showKey,
    showTitle: show.showTitle,
  });
}

export function logPlayedPlaylist(playlist: { playlistId?: string; playlistName?: string }) {
  logActivity({
    type: "played_playlist",
    playlistId: playlist.playlistId,
    playlistName: playlist.playlistName,
  });
}

export function logPlayedSong(song: {
  showKey?: string;
  showTitle?: string;
  songTitle?: string;
}) {
  logActivity({
    type: "played_song",
    showKey: song.showKey,
    showTitle: song.showTitle,
    songTitle: song.songTitle,
  });
}
