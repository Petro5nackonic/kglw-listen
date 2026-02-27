"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePlayer } from "@/components/player/store";
import { AddToPlaylistMenu } from "@/components/playlists/AddToPlaylistMenu";
import { toDisplayTitle, toDisplayTrackTitle } from "@/utils/displayTitle";

type Source = {
  identifier: string;
  title: string;
  hint: "SBD" | "AUD" | "MATRIX" | "UNKNOWN";
  downloads: number;
  avg_rating: number;
  num_reviews: number;
  score: number;
};

type ShowApiResponse = {
  key: string;
  showDate: string;
  defaultId: string | null;
  sources: Source[];
};

type IaMetadataFile = {
  name: string;
  format?: string;
  title?: string;
  track?: string;
  length?: string;
};

type IaMetadataResponse = {
  metadata?: {
    title?: string;
    venue?: string;
    coverage?: string;
    description?: string;
  };
  files?: IaMetadataFile[];
};

function safeDecode(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function isAudioFile(name: string) {
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

  // Prefer edited/stereo mixes if present (common cause of duplicates).
  if (n.includes("edited")) return 1;
  if (n.includes("stereo")) return 2;

  // Neutral/default.
  if (
    n.includes("audience") ||
    n.includes("matrix") ||
    n.includes("soundboard")
  )
    return 3;

  // De-prioritize raw/original multi-channel captures.
  if (n.includes("og")) return 10;
  if (n.includes("original")) return 11;
  if (
    n.includes("4ch") ||
    n.includes("4-ch") ||
    n.includes("4 channel") ||
    n.includes("4-channel")
  )
    return 12;

  return 5;
}

function parseTrackNum(t?: string) {
  if (!t) return Number.POSITIVE_INFINITY;
  const m = String(t).match(/^(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

export default function ShowPage({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    queue,
    index: playingIndex,
    playing,
    setQueue,
    setPlaying,
  } = usePlayer();

  // Primary: params.key (ideal)
  // Fallback: last segment of the URL (/show/<segment>)
  const showKey = useMemo(() => {
    const raw =
      (typeof params?.key === "string" ? params.key : undefined) ??
      (() => {
        const seg = (pathname || "").split("/").filter(Boolean).pop();
        return seg || "";
      })();

    return safeDecode(raw);
  }, [params, pathname]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [show, setShow] = useState<ShowApiResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [meta, setMeta] = useState<IaMetadataResponse | null>(null);
  const [focusedTrackIdx, setFocusedTrackIdx] = useState<number | null>(null);
  const trackRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);
      setShow(null);
      setSelectedId(null);
      setMeta(null);

      // Guard: if we still don't have a key, show a real error instead of calling API with undefined
      if (!showKey || showKey === "undefined") {
        setError("Route param missing. Expected /show/<showKey>.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/ia/show?key=${encodeURIComponent(showKey)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`GET /api/ia/show failed: ${res.status}`);
        const data = (await res.json()) as ShowApiResponse;

        if (!alive) return;
        setShow(data);
        setSelectedId(data.defaultId ?? data.sources?.[0]?.identifier ?? null);
      } catch (e: unknown) {
        if (!alive) return;
        if (e instanceof Error) setError(e.message);
        else setError("Failed to load show");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [showKey]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!selectedId) return;
      setMeta(null);

      try {
        const res = await fetch(
          `https://archive.org/metadata/${encodeURIComponent(selectedId)}`,
          { cache: "no-store" },
        );
        if (!res.ok)
          throw new Error(`GET archive metadata failed: ${res.status}`);
        const data = (await res.json()) as IaMetadataResponse;

        if (!alive) return;
        setMeta(data);
      } catch (e: unknown) {
        if (!alive) return;
        if (e instanceof Error) setError(e.message);
        else setError("Failed to load archive metadata");
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const tracks = useMemo(() => {
    if (!selectedId) return [];
    const files = meta?.files ?? [];
    const audioAll = files.filter((f) => f?.name && isAudioFile(f.name));
    if (audioAll.length === 0) return [];

    // Pick a single track set (e.g., Edited vs OG) to avoid duplicates.
    const bestSetRank = Math.min(...audioAll.map((f) => trackSetRank(f.name)));
    const audioSet = audioAll.filter(
      (f) => trackSetRank(f.name) === bestSetRank,
    );

    // Prefer a single format (FLAC > MP3 > ...), since IA often includes multiple encodes.
    const bestExtRank = Math.min(...audioSet.map((f) => audioExtRank(f.name)));
    const audio = audioSet.filter((f) => audioExtRank(f.name) === bestExtRank);

    audio.sort((a, b) => {
      const ta = parseTrackNum(a.track);
      const tb = parseTrackNum(b.track);
      if (ta !== tb) return ta - tb;
      return (a.name || "").localeCompare(b.name || "");
    });

    // De-dupe identical songs when multiple copies remain.
    const seen = new Set<string>();
    const out: { title: string; length?: string; url: string }[] = [];
    for (const f of audio) {
      const title = f.title || f.name;
      const key = `${title.toLowerCase()}|${f.length || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = `https://archive.org/download/${encodeURIComponent(selectedId)}/${encodeURIComponent(f.name)}`;
      out.push({ title, length: f.length, url });
    }

    return out;
  }, [meta, selectedId]);

  const requestedSong = useMemo(() => {
    return (searchParams?.get("song") || "").trim().toLowerCase();
  }, [searchParams]);

  useEffect(() => {
    if (!requestedSong) return;
    if (tracks.length === 0) return;

    const normalize = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const needle = normalize(requestedSong);
    if (!needle) return;

    const idx = tracks.findIndex((t) => normalize(t.title).includes(needle));
    if (idx < 0) return;

    setFocusedTrackIdx(idx);
    const el = trackRefs.current[idx];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    const timer = setTimeout(() => setFocusedTrackIdx(null), 4000);
    return () => clearTimeout(timer);
  }, [requestedSong, tracks]);

  const showDate = show?.showDate || showKey.split("|")[0] || "";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <Link href="/" className="text-sm text-white/70 hover:text-white">
          ← Back
        </Link>

        <div className="mt-3">
          <div className="text-sm text-white/70">{showDate || "(no date)"}</div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {toDisplayTitle(
              meta?.metadata?.title ||
                show?.sources?.find((s) => s.identifier === selectedId)?.title ||
                showKey,
            )}
          </h1>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-white/60">Loading show…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 whitespace-pre-wrap">
          {error}
          <div className="mt-2 text-xs text-white/60">
            Debug: pathname = <span className="text-white/80">{pathname}</span>
            {"\n"}Debug: showKey ={" "}
            <span className="text-white/80">{showKey}</span>
          </div>
        </div>
      ) : !show ? (
        <div className="text-sm text-white/60">No show data returned.</div>
      ) : show.sources.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70 whitespace-pre-wrap">
          No sources found for this show.
          <div className="mt-2 text-xs text-white/60">
            Debug: pathname = <span className="text-white/80">{pathname}</span>
            {"\n"}Debug: showKey ={" "}
            <span className="text-white/80">{showKey}</span>
          </div>
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm text-white/70">Source</div>
                <div className="text-xs text-white/50">
                  {show.sources.length} source(s)
                </div>
              </div>

              <select
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
                value={selectedId ?? ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                }}
              >
                {show.sources.map((s) => (
                  <option key={s.identifier} value={s.identifier}>
                    {s.hint} • {s.downloads.toLocaleString()} dl •{" "}
                    {toDisplayTitle(s.title).slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 p-4">
              <div className="text-sm text-white/70">Tracks</div>
              <div className="text-xs text-white/50">
                {meta ? `${tracks.length} track(s)` : "Loading track list…"}
              </div>
            </div>

            <div className="divide-y divide-white/10">
              {tracks.map((t, idx) => {
                const currentUrl = queue?.[playingIndex]?.url;
                const isCurrent = Boolean(currentUrl && currentUrl === t.url);
                const rightLabel = isCurrent
                  ? playing
                    ? "Playing"
                    : "Paused"
                  : "Play";

                const trackForPlaylist = {
                  title: toDisplayTrackTitle(t.title),
                  url: t.url,
                  length: t.length,
                  track: String(idx + 1),
                };

                return (
                  <div
                    key={t.url}
                    ref={(el) => {
                      trackRefs.current[idx] = el;
                    }}
                    className={`w-full p-4 transition flex items-center justify-between gap-3 ${
                      isCurrent ? "bg-white/5" : "hover:bg-white/5"
                    } ${
                      focusedTrackIdx === idx
                        ? "bg-fuchsia-500/10 ring-1 ring-fuchsia-400/60 ring-inset"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // Always set the full show as the queue so it can auto-advance.
                        setQueue(
                          tracks.map((x, i) => ({
                            title: toDisplayTrackTitle(x.title),
                            url: x.url,
                            length: x.length,
                            track: String(i + 1),
                          })),
                          idx,
                        );

                        // If user clicked the currently playing track, treat as toggle.
                        // (Queue replace above keeps behavior consistent across sources.)
                        if (isCurrent) setPlaying(!playing);
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm">
                          <span className="text-white/50 mr-2">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          <span className="truncate inline-block max-w-[65ch] align-bottom">
                            {toDisplayTrackTitle(t.title)}
                          </span>
                        </div>
                        {t.length ? (
                          <div className="mt-1 text-xs text-white/50">
                            {t.length}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-xs text-white/60 shrink-0">
                        {rightLabel}
                      </div>
                    </button>

                    <div className="shrink-0">
                      <AddToPlaylistMenu track={trackForPlaylist} />
                    </div>
                  </div>
                );
              })}

              {meta && tracks.length === 0 && (
                <div className="p-4 text-sm text-white/70">
                  No audio tracks found for this source.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
